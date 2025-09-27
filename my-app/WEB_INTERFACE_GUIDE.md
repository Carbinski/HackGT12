# JSON File API Web Interface

## 🚀 Getting Started

1. **Start the development server:**
   ```bash
   npm run dev
   ```

2. **Open your browser and go to:**
   ```
   http://localhost:3000
   ```

## 🎯 How to Use the Interface

### **File Management**
- Enter a filename (without .json extension) to work with different JSON files
- Click "Load Data" to fetch existing data from the API

### **Creating Objects**
1. Fill in the "Create New Object" form:
   - **Name**: Human-readable name (e.g., "Database Server")
   - **Type**: Object type (e.g., "server", "application", "database")
   - **Outgoing Connections**: Comma-separated IDs this object connects to
   - **Incoming Connections**: Comma-separated IDs that connect to this object
2. Click "Create Object" to save it

### **Updating Objects**
1. Select an existing object from the dropdown
2. Modify the fields as needed
3. Click "Update Object" to save changes

### **Viewing Objects**
- All objects are displayed in cards showing:
  - Name and type
  - Unique ID
  - Outgoing connections (→)
  - Incoming connections (←)

### **Deleting Objects**
- Click the "Delete" button on any object card
- Confirm the deletion in the popup

## 🧪 Testing Your API

### **Test Scenarios**

1. **Create a simple network:**
   ```
   Object 1: Name="Database", Type="database", Out="app-1", In=""
   Object 2: Name="Web App", Type="application", Out="", In="db-1"
   ```

2. **Test connection updates:**
   - Create objects first
   - Update connections to reference other objects
   - See how connections are displayed

3. **Test error handling:**
   - Try creating objects with invalid connections
   - Try updating non-existent objects
   - Try deleting objects

### **API Endpoints Being Tested**

- **GET** `/api/data/[filename]` - Load data
- **POST** `/api/data/[filename]` - Create new object
- **PUT** `/api/data/[filename]?id=[object-id]` - Update object
- **DELETE** `/api/data/[filename]?id=[object-id]` - Delete object

## 📁 File Storage

JSON files are automatically created in the `data/` directory:
- `data/test-data.json`
- `data/network-nodes.json`
- `data/microservices.json`
- etc.

## 🔧 Features

- ✅ **Real-time updates** - Changes reflect immediately
- ✅ **Connection visualization** - See outgoing and incoming connections
- ✅ **Error handling** - Clear error messages for failed operations
- ✅ **Loading states** - Visual feedback during API calls
- ✅ **Responsive design** - Works on desktop and mobile
- ✅ **Type safety** - Full TypeScript support

## 🎨 UI Components

- **File Management**: Switch between different JSON files
- **Create Form**: Add new connected objects
- **Update Form**: Modify existing objects
- **Object Cards**: Display all objects with connections
- **Message Display**: Show success/error messages

## 🚨 Troubleshooting

- **"Network error"**: Check if the dev server is running
- **"Error: File not found"**: This is normal for new files
- **Connection issues**: Make sure IDs reference existing objects
- **TypeScript errors**: Check browser console for details

## 📝 Example Data Structure

```json
[
  {
    "id": "db-1",
    "name": "Primary Database",
    "type": "database",
    "connections_out": ["app-1", "app-2"],
    "connections_in": []
  },
  {
    "id": "app-1",
    "name": "Web Application",
    "type": "application",
    "connections_out": ["lb-1"],
    "connections_in": ["db-1"]
  }
]
```

Happy testing! 🎉
