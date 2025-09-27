import fs from 'fs/promises';
import path from 'path';

// Types for our data operations
export interface DataItem {
  id: string;
  [key: string]: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Utility function to ensure data directory exists
async function ensureDataDirectory(): Promise<void> {
  const dataDir = path.join(process.cwd(), 'data');
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// GET function - Read data from JSON file
export async function getData(filename: string): Promise<ApiResponse<DataItem[]>> {
  try {
    await ensureDataDirectory();
    const filePath = path.join(process.cwd(), 'data', `${filename}.json`);
    
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(fileContent);
      return {
        success: true,
        data: Array.isArray(data) ? data : [data],
        message: 'Data retrieved successfully'
      };
    } catch (error) {
      // File doesn't exist, return empty array
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return {
          success: true,
          data: [],
          message: 'File not found, returning empty array'
        };
      }
      throw error;
    }
  } catch (error) {
    return {
      success: false,
      error: `Failed to read data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// POST function - Write data to JSON file
export async function postData(filename: string, data: DataItem | DataItem[]): Promise<ApiResponse> {
  try {
    await ensureDataDirectory();
    const filePath = path.join(process.cwd(), 'data', `${filename}.json`);
    
    // Generate ID if not provided
    const processedData = Array.isArray(data) 
      ? data.map(item => ({ ...item, id: item.id || generateId() }))
      : { ...data, id: data.id || generateId() };
    
    await fs.writeFile(filePath, JSON.stringify(processedData, null, 2), 'utf-8');
    
    return {
      success: true,
      data: processedData,
      message: 'Data saved successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to save data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// PUT function - Update existing data
export async function updateData(filename: string, id: string, updatedData: Partial<DataItem>): Promise<ApiResponse<DataItem>> {
  try {
    const result = await getData(filename);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }
    
    const data = result.data || [];
    const itemIndex = data.findIndex(item => item.id === id);
    
    if (itemIndex === -1) {
      return {
        success: false,
        error: 'Item not found'
      };
    }
    
    const updatedItem = { ...data[itemIndex], ...updatedData };
    data[itemIndex] = updatedItem;
    
    const saveResult = await postData(filename, data);
    
    if (!saveResult.success) {
      return saveResult;
    }
    
    return {
      success: true,
      data: updatedItem,
      message: 'Data updated successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// DELETE function - Remove data from JSON file
export async function deleteData(filename: string, id: string): Promise<ApiResponse> {
  try {
    const result = await getData(filename);
    
    if (!result.success) {
      return {
        success: false,
        error: result.error
      };
    }
    
    const data = result.data || [];
    const filteredData = data.filter(item => item.id !== id);
    
    if (filteredData.length === data.length) {
      return {
        success: false,
        error: 'Item not found'
      };
    }
    
    const saveResult = await postData(filename, filteredData);
    
    if (!saveResult.success) {
      return saveResult;
    }
    
    return {
      success: true,
      message: 'Data deleted successfully'
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete data: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

// Helper function to generate unique IDs
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Helper function to validate data structure
export function validateDataItem(data: any): data is DataItem {
  return typeof data === 'object' && data !== null && typeof data.id === 'string';
}
