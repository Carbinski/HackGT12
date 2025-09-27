import { NextRequest, NextResponse } from 'next/server';
import { getData, postData, updateData, deleteData, validateDataItem } from '@/api/data';

// GET /api/data/[filename] - Read data from JSON file
export async function GET(request: NextRequest, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;
  try {
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename is required' },
        { status: 400 }
      );
    }

    const result = await getData(filename);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
} catch (error) {
  return NextResponse.json(
    { 
      success: false, 
      error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
    },
    { status: 500 }
  );
}


}

// POST /api/data/[filename] - Write data to JSON file
export async function POST(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename is required' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    if (!body || (typeof body !== 'object')) {
      return NextResponse.json(
        { success: false, error: 'Invalid data format. Expected JSON object or array.' },
        { status: 400 }
      );
    }

    const result = await postData(filename, body);
    
    if (!result.success) {
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}

// PUT /api/data/[filename] - Update existing data
export async function PUT(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID parameter is required for updates' },
        { status: 400 }
      );
    }

    const body = await request.json();
    
    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { success: false, error: 'Invalid data format. Expected JSON object.' },
        { status: 400 }
      );
    }

    const result = await updateData(filename, id, body);
    
    if (!result.success) {
      return NextResponse.json(result, { status: result.error?.includes('not found') ? 404 : 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}

// DELETE /api/data/[filename] - Delete data from JSON file
export async function DELETE(
  request: NextRequest,
  { params }: { params: { filename: string } }
) {
  try {
    const { filename } = params;
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!filename) {
      return NextResponse.json(
        { success: false, error: 'Filename is required' },
        { status: 400 }
      );
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: 'ID parameter is required for deletion' },
        { status: 400 }
      );
    }

    const result = await deleteData(filename, id);
    
    if (!result.success) {
      return NextResponse.json(result, { status: result.error?.includes('not found') ? 404 : 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: `Server error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      },
      { status: 500 }
    );
  }
}

