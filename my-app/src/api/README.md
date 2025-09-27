# JSON File API

This module provides functions to read from and write to JSON files, along with HTTP API endpoints for Next.js applications.

## Features

- ✅ **GET** - Read data from JSON files
- ✅ **POST** - Write data to JSON files  
- ✅ **PUT** - Update existing data in JSON files
- ✅ **DELETE** - Remove data from JSON files
- ✅ **HTTP API Routes** - RESTful endpoints for web applications
- ✅ **Error Handling** - Comprehensive error handling and validation
- ✅ **TypeScript Support** - Full TypeScript support with type definitions
- ✅ **Auto ID Generation** - Automatic unique ID generation for data items

## File Structure

```
src/
├── api/
│   ├── data.ts          # Core functions for JSON file operations
│   └── example.ts       # Usage examples
└── app/
    └── api/
        └── data/
            └── [filename]/
                └── route.ts  # HTTP API routes
```

## Core Functions

### `getData(filename: string)`
Reads data from a JSON file.

```typescript
const result = await getData('users');
if (result.success) {
  console.log(result.data); // Array of user objects
}
```

### `postData(filename: string, data: DataItem | DataItem[])`
Writes data to a JSON file.

```typescript
const newUser = { name: 'John Doe', email: 'john@example.com' };
const result = await postData('users', newUser);
```

### `updateData(filename: string, id: string, updatedData: Partial<DataItem>)`
Updates an existing item in a JSON file.

```typescript
const result = await updateData('users', 'user-id-123', { 
  name: 'John Updated' 
});
```

### `deleteData(filename: string, id: string)`
Removes an item from a JSON file.

```typescript
const result = await deleteData('users', 'user-id-123');
```

## HTTP API Endpoints

### GET `/api/data/[filename]`
Read data from a JSON file.

```bash
curl http://localhost:3000/api/data/users
```

### POST `/api/data/[filename]`
Write data to a JSON file.

```bash
curl -X POST http://localhost:3000/api/data/users \
  -H "Content-Type: application/json" \
  -d '{"name": "John Doe", "email": "john@example.com"}'
```

### PUT `/api/data/[filename]?id=[item-id]`
Update existing data in a JSON file.

```bash
curl -X PUT "http://localhost:3000/api/data/users?id=user-id-123" \
  -H "Content-Type: application/json" \
  -d '{"name": "John Updated"}'
```

### DELETE `/api/data/[filename]?id=[item-id]`
Delete data from a JSON file.

```bash
curl -X DELETE "http://localhost:3000/api/data/users?id=user-id-123"
```

## Data Storage

JSON files are stored in the `data/` directory at the project root:

```
data/
├── users.json
├── products.json
└── settings.json
```

## Response Format

All functions return a consistent response format:

```typescript
interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

### Success Response
```json
{
  "success": true,
  "data": [...],
  "message": "Data retrieved successfully"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Failed to read data: File not found"
}
```

## Usage Examples

### Basic Usage
```typescript
import { getData, postData } from '@/api/data';

// Create some data
await postData('users', [
  { name: 'John Doe', email: 'john@example.com' },
  { name: 'Jane Smith', email: 'jane@example.com' }
]);

// Read the data
const result = await getData('users');
console.log(result.data); // Array of user objects
```

### With Error Handling
```typescript
const result = await getData('users');
if (result.success) {
  console.log('Users:', result.data);
} else {
  console.error('Error:', result.error);
}
```

### HTTP API Usage (Client-side)
```typescript
// Fetch data
const response = await fetch('/api/data/users');
const data = await response.json();

// Create data
const createResponse = await fetch('/api/data/users', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ name: 'New User', email: 'new@example.com' })
});
```

## TypeScript Types

```typescript
interface DataItem {
  id: string;
  [key: string]: any;
}

interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
```

## Error Handling

The API handles various error scenarios:

- **File not found**: Returns empty array for GET operations
- **Invalid JSON**: Returns error with details
- **Missing parameters**: Returns 400 Bad Request
- **Item not found**: Returns 404 Not Found for PUT/DELETE operations
- **Server errors**: Returns 500 Internal Server Error

## Notes

- All data items automatically receive a unique ID if not provided
- JSON files are created in the `data/` directory automatically
- The API supports both single objects and arrays of objects
- All operations are asynchronous and return Promises
- File operations use Node.js `fs/promises` for better performance

