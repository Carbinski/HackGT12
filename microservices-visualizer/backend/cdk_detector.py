#!/usr/bin/env python3
"""
AWS CDK Multi-Repository Detector

This script scans multiple repositories to detect AWS CDK projects and files.
It provides a comprehensive view of CDK usage across your multi-repo architecture.
"""

import os
import json
import sys
from pathlib import Path
from typing import List, Dict, Set, Optional, Tuple
from dataclasses import dataclass, asdict
import re
from concurrent.futures import ThreadPoolExecutor, as_completed


@dataclass
class CDKFile:
    """Represents a detected CDK file"""
    file_path: str
    file_type: str
    relative_path: str
    size: int
    language: str


@dataclass
class CDKProject:
    """Represents a CDK project/repository"""
    repo_path: str
    repo_name: str
    has_cdk_json: bool
    has_package_json: bool
    cdk_files: List[CDKFile]
    stacks: List[str]
    constructs: List[str]
    aws_services: Set[str]
    languages: Set[str]
    cdk_version: Optional[str] = None
    app_command: Optional[str] = None


class CDKDetector:
    """Detects AWS CDK projects and files across multiple repositories"""
    
    def __init__(self,
                 skip_dirs: Optional[Set[str]] = None,
                 max_size_mb: float = 2.0,
                 fast_mode: bool = False,
                 workers: int = 8):
        # CDK-specific file patterns
        self.cdk_files_patterns = {
            'cdk.json': 'config',
            'cdk.out': 'output',
            'package.json': 'package',
            'requirements.txt': 'python_deps',
            'pyproject.toml': 'python_deps',
            'pom.xml': 'java_deps',
            'build.gradle': 'java_deps',
            'Pipfile': 'python_deps',
            'go.mod': 'go_deps',
            '.cdk.staging': 'staging'
        }
        
        # Files to skip entirely (lock files, config files that aren't CDK-specific, etc.)
        self.skip_files = {
            'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock',
            'Pipfile.lock', 'poetry.lock', 'go.sum',
            'tsconfig.json', 'jest.config.js', 'webpack.config.js',
            'babel.config.js', 'rollup.config.js', 'vite.config.js'
        }
        
        # CDK import patterns for different languages
        self.cdk_import_patterns = {
            'typescript': [
                r'import.*aws-cdk-lib',
                r'import.*@aws-cdk/',
                r'from.*aws-cdk-lib',
                r'require\([\'"]aws-cdk-lib[\'"]\)',
                r'require\([\'"]@aws-cdk/'
            ],
            'python': [
                r'import aws_cdk',
                r'from aws_cdk',
                r'import constructs',
                r'from constructs'
            ],
            'java': [
                r'import software\.amazon\.awscdk',
                r'import software\.constructs'
            ],
            'csharp': [
                r'using Amazon\.CDK',
                r'using Amazon\.CDK\.'
            ],
            'go': [
                r'github\.com/aws/aws-cdk-go',
                r'github\.com/aws/constructs-go'
            ]
        }
        
        # AWS service patterns to detect
        self.aws_service_patterns = {
            'lambda': r'aws-lambda|aws_lambda|Lambda',
            's3': r'aws-s3|aws_s3|Bucket',
            'dynamodb': r'aws-dynamodb|aws_dynamodb|Table',
            'sqs': r'aws-sqs|aws_sqs|Queue',
            'sns': r'aws-sns|aws_sns|Topic',
            'apigateway': r'aws-apigateway|aws_apigateway|RestApi|HttpApi',
            'ecs': r'aws-ecs|aws_ecs|Cluster|Service',
            'ec2': r'aws-ec2|aws_ec2|Instance|Vpc',
            'rds': r'aws-rds|aws_rds|Database',
            'iam': r'aws-iam|aws_iam|Role|Policy',
            'cloudformation': r'aws-cloudformation|aws_cloudformation',
            'stepfunctions': r'aws-stepfunctions|aws_stepfunctions|StateMachine',
            'eventbridge': r'aws-events|aws_events|Rule',
            'kinesis': r'aws-kinesis|aws_kinesis|Stream',
            'cognito': r'aws-cognito|aws_cognito|UserPool',
            'cloudfront': r'aws-cloudfront|aws_cloudfront|Distribution'
        }
        
        # File extensions that might contain CDK code
        self.cdk_code_extensions = {
            '.ts': 'typescript',
            '.js': 'javascript', 
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.go': 'go',
            '.yaml': 'yaml',
            '.yml': 'yaml'
        }

        # Runtime options
        self.fast_mode = fast_mode
        self.workers = max(1, int(workers))
        self.max_size_bytes = int(max(0.1, float(max_size_mb)) * 1024 * 1024)

        # Directories to skip (pruned during traversal)
        default_skip = {
            'node_modules', '.git', '.idea', '.vscode', '__pycache__',
            '.pytest_cache', '.mypy_cache', 'dist', 'build', 'target',
            '.aws-sam', 'cdk.out', '.cdk.staging'
        }
        self.skip_dirs = set(default_skip)
        if skip_dirs:
            self.skip_dirs.update(skip_dirs)

        # Precompile regexes
        self._compile_patterns()

    def _compile_patterns(self) -> None:
        """Compile all regex patterns once for performance."""
        self.compiled_import_patterns: Dict[str, List[re.Pattern]] = {}
        for lang, patterns in self.cdk_import_patterns.items():
            self.compiled_import_patterns[lang] = [re.compile(p, re.IGNORECASE) for p in patterns]

        generic_patterns = [
            r'cdk\.Stack',
            r'constructs\.Construct',
            r'aws-cdk',
            r'@aws-cdk',
            r'CDK',
            r'Stack.*extends',
            r'new.*Stack'
        ]
        self.compiled_generic_patterns: List[re.Pattern] = [re.compile(p, re.IGNORECASE) for p in generic_patterns]

        self.compiled_service_patterns: Dict[str, re.Pattern] = {
            service: re.compile(pattern, re.IGNORECASE)
            for service, pattern in self.aws_service_patterns.items()
        }

    def _package_json_has_cdk(self, package_config: Dict) -> bool:
        deps = package_config.get('dependencies', {}) or {}
        dev_deps = package_config.get('devDependencies', {}) or {}
        combined = {**deps, **dev_deps}
        keys = list(combined.keys())
        return any(k.startswith('@aws-cdk/') or k.startswith('aws-cdk') or k == 'aws-cdk-lib' for k in keys)

    def _requirements_has_cdk(self, text: str) -> bool:
        return bool(re.search(r'(^|\n)\s*(aws-cdk|aws-cdk-lib|aws-cdk\.core)', text, re.IGNORECASE))

    def _pyproject_has_cdk(self, text: str) -> bool:
        return 'aws-cdk' in text or 'aws-cdk-lib' in text or 'aws-cdk.core' in text

    def _go_mod_has_cdk(self, text: str) -> bool:
        return 'github.com/aws/aws-cdk-go' in text or 'github.com/aws/constructs-go' in text

    def _is_probably_binary(self, file_path: Path) -> bool:
        """Heuristic to skip likely-binary files."""
        try:
            with open(file_path, 'rb') as f:
                chunk = f.read(4096)
            if not chunk:
                return False
            # If it has a NUL byte, likely binary
            if b'\x00' in chunk:
                return True
            # High ratio of non-text bytes
            text_bytes = bytearray({7, 8, 9, 10, 12, 13, 27})
            text_bytes.extend(range(0x20, 0x100))
            nontext = sum(byte not in text_bytes for byte in chunk)
            return (nontext / max(1, len(chunk))) > 0.30
        except Exception:
            return False

    def scan_repositories(self, base_paths: List[str]) -> List[CDKProject]:
        """Scan multiple repository paths for CDK projects."""
        found_projects: List[CDKProject] = []
        tasks: List[Tuple[Path, Path]] = []  # (repo_root, analyzed_path)

        for base in base_paths:
            base_path = Path(base).expanduser().resolve()
            if not base_path.exists():
                print(f"Warning: Path {base_path} does not exist")
                continue

            print(f"Scanning: {base_path}")

            if base_path.is_file():
                base_path = base_path.parent

            # Decide if base_path is a repo or a workspace container
            if self._is_repo_root(base_path):
                tasks.append((base_path, base_path))
            else:
                # Treat immediate children as potential repos
                try:
                    for child in base_path.iterdir():
                        if child.is_dir() and not child.name.startswith('.') and child.name not in self.skip_dirs:
                            tasks.append((child, child))
                except PermissionError:
                    pass

        if not tasks:
            return []

        # Analyze in parallel
        with ThreadPoolExecutor(max_workers=self.workers) as executor:
            future_to_path = {executor.submit(self.analyze_repository, repo_root): repo_root for (repo_root, _) in tasks}
            for future in as_completed(future_to_path):
                try:
                    project = future.result()
                    if project and (project.has_cdk_json or project.cdk_files or project.stacks or project.constructs):
                        found_projects.append(project)
                except Exception as exc:
                    path = future_to_path[future]
                    print(f"Error analyzing {path}: {exc}")

        return found_projects

    def _is_repo_root(self, path: Path) -> bool:
        """Heuristic: consider a path a repo if it has common manifest files indicating a project."""
        markers = {'cdk.json', 'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'pom.xml', 'build.gradle'}
        try:
            children = {p.name for p in path.iterdir() if p.is_file()}
            return any(m in children for m in markers)
        except Exception:
            return False

    def analyze_repository(self, repo_path: Path) -> Optional[CDKProject]:
        """Analyze a single repository for CDK usage with directory pruning and optional fast mode."""
        if not repo_path.is_dir():
            return None

        repo_name = repo_path.name
        cdk_files: List[CDKFile] = []
        stacks: List[str] = []
        constructs: List[str] = []
        aws_services: Set[str] = set()
        languages: Set[str] = set()
        has_cdk_json = False
        has_package_json = False
        cdk_version: Optional[str] = None
        app_command: Optional[str] = None
        has_cdk_evidence = False

        try:
            for root, dirs, files in os.walk(repo_path, topdown=True):
                # Prune directories
                dirs[:] = [d for d in dirs if not d.startswith('.') and d not in self.skip_dirs]

                for name in files:
                    file_path = Path(root) / name
                    relative_path = file_path.relative_to(repo_path)
                    file_name = file_path.name
                    file_ext = file_path.suffix.lower()

                    # Skip lock files and other ignored files
                    if file_name in self.skip_files:
                        continue

                    # Skip by size early
                    try:
                        file_size = file_path.stat().st_size
                    except Exception:
                        continue
                    if file_size > self.max_size_bytes:
                        continue

                    # Detect manifest/config files
                    if file_name == 'cdk.json':
                        has_cdk_json = True
                        has_cdk_evidence = True
                        cdk_version, app_command = self._parse_cdk_json(file_path)
                        cdk_files.append(CDKFile(
                            file_path=str(file_path),
                            file_type='config',
                            relative_path=str(relative_path),
                            size=file_size,
                            language='json'
                        ))
                        # In fast mode, we can stop early if clear evidence found
                        continue

                    if file_name == 'package.json':
                        has_package_json = True
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                package_config = json.load(f)
                            if self._package_json_has_cdk(package_config):
                                has_cdk_evidence = True
                                cdk_files.append(CDKFile(
                                    file_path=str(file_path),
                                    file_type='package',
                                    relative_path=str(relative_path),
                                    size=file_size,
                                    language='json'
                                ))
                        except Exception:
                            pass
                        continue

                    if file_name in ('requirements.txt', 'Pipfile', 'pyproject.toml'):
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            if (file_name == 'requirements.txt' and self._requirements_has_cdk(content)) or \
                               (file_name == 'pyproject.toml' and self._pyproject_has_cdk(content)) or \
                               (file_name == 'Pipfile' and self._requirements_has_cdk(content)):
                                has_cdk_evidence = True
                                cdk_files.append(CDKFile(
                                    file_path=str(file_path),
                                    file_type='python_deps',
                                    relative_path=str(relative_path),
                                    size=file_size,
                                    language='unknown'
                                ))
                        except Exception:
                            pass
                        continue

                    if file_name == 'go.mod':
                        try:
                            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                                content = f.read()
                            if self._go_mod_has_cdk(content):
                                has_cdk_evidence = True
                                cdk_files.append(CDKFile(
                                    file_path=str(file_path),
                                    file_type='go_deps',
                                    relative_path=str(relative_path),
                                    size=file_size,
                                    language='go'
                                ))
                        except Exception:
                            pass
                        continue

                    # If fast mode, do not scan code files' contents
                    if self.fast_mode:
                        continue

                    # Analyze code files for CDK patterns
                    if file_ext in self.cdk_code_extensions:
                        # Skip binary looking files
                        if self._is_probably_binary(file_path):
                            continue

                        language = self.cdk_code_extensions[file_ext]
                        if self._contains_cdk_code(file_path, language):
                            languages.add(language)
                            has_cdk_evidence = True

                            file_stacks, file_constructs, file_services = self._analyze_cdk_file(file_path, language)
                            stacks.extend(file_stacks)
                            constructs.extend(file_constructs)
                            aws_services.update(file_services)

                            # Add to CDK files if not already added
                            cdk_files.append(CDKFile(
                                file_path=str(file_path),
                                file_type='code',
                                relative_path=str(relative_path),
                                size=file_size,
                                language=language
                            ))

        except PermissionError:
            print(f"Permission denied accessing {repo_path}")
            return None
        except Exception as e:
            print(f"Error analyzing {repo_path}: {e}")
            return None

        if has_cdk_json or has_cdk_evidence or cdk_files or stacks or constructs:
            return CDKProject(
                repo_path=str(repo_path),
                repo_name=repo_name,
                has_cdk_json=has_cdk_json,
                has_package_json=has_package_json,
                cdk_files=cdk_files,
                stacks=list(set(stacks)),
                constructs=list(set(constructs)),
                aws_services=aws_services,
                languages=languages,
                cdk_version=cdk_version,
                app_command=app_command
            )
        return None

    def _should_ignore_path(self, path: Path) -> bool:
        """Check if a path should be ignored"""
        ignore_patterns = [
            'node_modules', '.git', '.idea', '.vscode', '__pycache__',
            '.pytest_cache', '.mypy_cache', 'dist', 'build', 'target',
            '.aws-sam', 'cdk.out', '.cdk.staging'
        ]
        
        path_str = str(path)
        return any(pattern in path_str for pattern in ignore_patterns)

    def _detect_language(self, file_path: Path) -> str:
        """Detect the programming language of a file"""
        ext = file_path.suffix.lower()
        return self.cdk_code_extensions.get(ext, 'unknown')

    def _contains_cdk_code(self, file_path: Path, language: str) -> bool:
        """Check if a file contains CDK code"""
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            if language in self.compiled_import_patterns:
                for pattern in self.compiled_import_patterns[language]:
                    if pattern.search(content):
                        return True
            for pattern in self.compiled_generic_patterns:
                if pattern.search(content):
                    return True
            
        except Exception:
            pass
            
        return False

    def _analyze_cdk_file(self, file_path: Path, language: str) -> tuple:
        """Analyze a CDK file to extract stacks, constructs, and services"""
        stacks = []
        constructs = []
        services = set()
        
        try:
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
                content = f.read()
            
            # Extract stack names
            stack_patterns = [
                r'class\s+(\w*Stack)\s*extends',
                r'new\s+(\w*Stack)\s*\(',
                r'(\w+Stack)\s*=.*Stack'
            ]
            
            for pattern in stack_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                stacks.extend(matches)
            
            # Extract construct names
            construct_patterns = [
                r'class\s+(\w+)\s*extends.*Construct',
                r'new\s+(\w+)\s*\(.*Construct'
            ]
            
            for pattern in construct_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                constructs.extend(matches)
            
            # Detect AWS services
            for service, pattern in self.compiled_service_patterns.items():
                if pattern.search(content):
                    services.add(service)
                    
        except Exception:
            pass
        
        return stacks, constructs, services

    def _parse_cdk_json(self, cdk_json_path: Path) -> tuple:
        """Parse cdk.json file to extract version and app command"""
        try:
            with open(cdk_json_path, 'r', encoding='utf-8') as f:
                cdk_config = json.load(f)
            
            app_command = cdk_config.get('app')
            
            # Try to find CDK version from package.json in same directory
            package_json_path = cdk_json_path.parent / 'package.json'
            cdk_version = None
            
            if package_json_path.exists():
                try:
                    with open(package_json_path, 'r', encoding='utf-8') as f:
                        package_config = json.load(f)
                    
                    deps = package_config.get('dependencies', {})
                    dev_deps = package_config.get('devDependencies', {})
                    
                    for dep_dict in [deps, dev_deps]:
                        if 'aws-cdk-lib' in dep_dict:
                            cdk_version = dep_dict['aws-cdk-lib']
                            break
                        elif '@aws-cdk/core' in dep_dict:
                            cdk_version = dep_dict['@aws-cdk/core']
                            break
                            
                except Exception:
                    pass
            
            return cdk_version, app_command
            
        except Exception:
            return None, None

    def generate_report(self, projects: List[CDKProject], output_format: str = 'console') -> str:
        """Generate a report of detected CDK projects"""
        if output_format == 'json':
            return self._generate_json_report(projects)
        else:
            return self._generate_console_report(projects)

    def _generate_console_report(self, projects: List[CDKProject]) -> str:
        """Generate a console-friendly report"""
        if not projects:
            return "No CDK projects detected."
        
        report = []
        report.append("=" * 80)
        report.append(f"AWS CDK Multi-Repository Detection Report")
        report.append("=" * 80)
        report.append(f"Total CDK Projects Found: {len(projects)}")
        report.append("")
        
        for i, project in enumerate(projects, 1):
            report.append(f"{i}. {project.repo_name}")
            report.append("-" * 60)
            report.append(f"   Path: {project.repo_path}")
            report.append(f"   CDK Config: {'✓' if project.has_cdk_json else '✗'}")
            report.append(f"   Package.json: {'✓' if project.has_package_json else '✗'}")
            
            if project.cdk_version:
                report.append(f"   CDK Version: {project.cdk_version}")
            
            if project.app_command:
                report.append(f"   App Command: {project.app_command}")
            
            if project.languages:
                report.append(f"   Languages: {', '.join(sorted(project.languages))}")
            
            if project.stacks:
                report.append(f"   Stacks: {', '.join(project.stacks[:5])}")
                if len(project.stacks) > 5:
                    report.append(f"           ... and {len(project.stacks) - 5} more")
            
            if project.aws_services:
                report.append(f"   AWS Services: {', '.join(sorted(project.aws_services))}")
            
            report.append(f"   CDK Files: {len(project.cdk_files)}")
            
            # Show all detected files
            if project.cdk_files:
                report.append(f"   All CDK Files:")
                for cdk_file in project.cdk_files:
                    file_size_kb = round(cdk_file.size / 1024, 1) if cdk_file.size > 0 else 0
                    report.append(f"     - {cdk_file.relative_path} ({cdk_file.file_type}, {cdk_file.language}, {file_size_kb}KB)")
            
            report.append("")
        
        # Summary statistics
        report.append("=" * 80)
        report.append("SUMMARY STATISTICS")
        report.append("=" * 80)
        
        all_languages = set()
        all_services = set()
        total_files = 0
        
        for project in projects:
            all_languages.update(project.languages)
            all_services.update(project.aws_services)
            total_files += len(project.cdk_files)
        
        report.append(f"Total CDK Files: {total_files}")
        report.append(f"Languages Used: {', '.join(sorted(all_languages))}")
        report.append(f"AWS Services: {', '.join(sorted(all_services))}")
        
        return "\n".join(report)

    def _generate_json_report(self, projects: List[CDKProject]) -> str:
        """Generate a JSON report"""
        # Convert to serializable format
        serializable_projects = []
        for project in projects:
            project_dict = asdict(project)
            project_dict['aws_services'] = list(project.aws_services)
            project_dict['languages'] = list(project.languages)
            serializable_projects.append(project_dict)
        
        return json.dumps({
            'summary': {
                'total_projects': len(projects),
                'total_files': sum(len(p.cdk_files) for p in projects),
                'languages': list(set().union(*[p.languages for p in projects])),
                'aws_services': list(set().union(*[p.aws_services for p in projects]))
            },
            'projects': serializable_projects
        }, indent=2)


def main():
    """Main function to run the CDK detector"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Detect AWS CDK projects across multiple repositories')
    parser.add_argument('paths', nargs='+', help='Paths to scan for CDK projects')
    parser.add_argument('--output', choices=['console', 'json'], default='console',
                        help='Output format (default: console)')
    parser.add_argument('--save', help='Save report to file')
    parser.add_argument('--fast', action='store_true', help='Fast mode: only look for manifest/dep indicators (no code scan)')
    parser.add_argument('--skip-dirs', nargs='*', default=None, help='Additional directory names to skip during scan')
    parser.add_argument('--max-size-mb', type=float, default=2.0, help='Max file size in MB to read/analyze (default: 2MB)')
    parser.add_argument('--workers', type=int, default=8, help='Number of parallel workers for repo scanning (default: 8)')
    
    args = parser.parse_args()
    
    detector = CDKDetector(skip_dirs=set(args.skip_dirs) if args.skip_dirs else None,
                           max_size_mb=args.max_size_mb,
                           fast_mode=args.fast,
                           workers=args.workers)
    projects = detector.scan_repositories(args.paths)
    report = detector.generate_report(projects, args.output)
    
    if args.save:
        with open(args.save, 'w') as f:
            f.write(report)
        print(f"Report saved to {args.save}")
    else:
        print(report)


if __name__ == '__main__':
    main()
