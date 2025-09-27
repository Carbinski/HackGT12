'use client';

import { useState, useEffect } from 'react';

interface ConnectedObject {
  id: string;
  name: string;
  type: string;
  connections_out: string[];
  connections_in: string[];
}

export default function Home() {
  const [objects, setObjects] = useState<ConnectedObject[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [filename, setFilename] = useState('test-data');
  
  // Form state for creating new objects
  const [newObject, setNewObject] = useState({
    name: '',
    type: '',
    connections_out: '',
    connections_in: ''
  });

  // Form state for updating objects
  const [updateObject, setUpdateObject] = useState({
    id: '',
    name: '',
    type: '',
    connections_out: '',
    connections_in: ''
  });

  // Fetch data from API
  const fetchData = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/data/${filename}`);
      const result = await response.json();
      
      if (result.success) {
        setObjects(result.data || []);
        setMessage(`✅ Loaded ${result.data?.length || 0} objects`);
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Network error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Create new object
  const createObject = async () => {
    if (!newObject.name || !newObject.type) {
      setMessage('❌ Name and type are required');
      return;
    }

    setLoading(true);
    try {
      const objectData = {
        name: newObject.name,
        type: newObject.type,
        connections_out: newObject.connections_out ? newObject.connections_out.split(',').map(id => id.trim()).filter(id => id) : [],
        connections_in: newObject.connections_in ? newObject.connections_in.split(',').map(id => id.trim()).filter(id => id) : []
      };

      const response = await fetch(`/api/data/${filename}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectData)
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage('✅ Object created successfully');
        setNewObject({ name: '', type: '', connections_out: '', connections_in: '' });
        fetchData(); // Refresh the list
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Network error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Update existing object
  const updateExistingObject = async () => {
    if (!updateObject.id) {
      setMessage('❌ Please select an object to update');
      return;
    }

    setLoading(true);
    try {
      const objectData = {
        name: updateObject.name,
        type: updateObject.type,
        connections_out: updateObject.connections_out ? updateObject.connections_out.split(',').map(id => id.trim()).filter(id => id) : [],
        connections_in: updateObject.connections_in ? updateObject.connections_in.split(',').map(id => id.trim()).filter(id => id) : []
      };

      const response = await fetch(`/api/data/${filename}?id=${updateObject.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(objectData)
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage('✅ Object updated successfully');
        setUpdateObject({ id: '', name: '', type: '', connections_out: '', connections_in: '' });
        fetchData(); // Refresh the list
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Network error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Delete object
  const deleteObject = async (id: string) => {
    if (!confirm('Are you sure you want to delete this object?')) return;

    setLoading(true);
    try {
      const response = await fetch(`/api/data/${filename}?id=${id}`, {
        method: 'DELETE'
      });

      const result = await response.json();
      
      if (result.success) {
        setMessage('✅ Object deleted successfully');
        fetchData(); // Refresh the list
      } else {
        setMessage(`❌ Error: ${result.error}`);
      }
    } catch (error) {
      setMessage(`❌ Network error: ${error}`);
    } finally {
      setLoading(false);
    }
  };

  // Load data on component mount
  useEffect(() => {
    fetchData();
  }, [filename]);

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">
          JSON File API Tester
        </h1>

        {/* Message Display */}
        {message && (
          <div className={`p-4 rounded-lg mb-6 ${
            message.includes('✅') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {message}
          </div>
        )}

        {/* Filename Input */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-semibold mb-4">File Management</h2>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filename (without .json extension)
              </label>
              <input
                type="text"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                className="border border-gray-300 rounded-md px-3 py-2 w-64"
                placeholder="test-data"
              />
            </div>
            <button
              onClick={fetchData}
              disabled={loading}
              className="bg-blue-500 text-white px-4 py-2 rounded-md hover:bg-blue-600 disabled:opacity-50"
            >
              {loading ? 'Loading...' : 'Load Data'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Create New Object */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Create New Object</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={newObject.name}
                  onChange={(e) => setNewObject({...newObject, name: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  placeholder="Database Server"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <input
                  type="text"
                  value={newObject.type}
                  onChange={(e) => setNewObject({...newObject, type: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  placeholder="server"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outgoing Connections (comma-separated IDs)</label>
                <input
                  type="text"
                  value={newObject.connections_out}
                  onChange={(e) => setNewObject({...newObject, connections_out: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  placeholder="node-2, node-3"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incoming Connections (comma-separated IDs)</label>
                <input
                  type="text"
                  value={newObject.connections_in}
                  onChange={(e) => setNewObject({...newObject, connections_in: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                  placeholder="node-1"
                />
              </div>
              <button
                onClick={createObject}
                disabled={loading}
                className="w-full bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600 disabled:opacity-50"
              >
                {loading ? 'Creating...' : 'Create Object'}
              </button>
            </div>
          </div>

          {/* Update Existing Object */}
          <div className="bg-white p-6 rounded-lg shadow">
            <h2 className="text-xl font-semibold mb-4">Update Object</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Select Object to Update</label>
                <select
                  value={updateObject.id}
                  onChange={(e) => {
                    const selected = objects.find(obj => obj.id === e.target.value);
                    if (selected) {
                      setUpdateObject({
                        id: selected.id,
                        name: selected.name,
                        type: selected.type,
                        connections_out: selected.connections_out.join(', '),
                        connections_in: selected.connections_in.join(', ')
                      });
                    }
                  }}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                >
                  <option value="">Select an object...</option>
                  {objects.map(obj => (
                    <option key={obj.id} value={obj.id}>{obj.name} ({obj.type})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={updateObject.name}
                  onChange={(e) => setUpdateObject({...updateObject, name: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <input
                  type="text"
                  value={updateObject.type}
                  onChange={(e) => setUpdateObject({...updateObject, type: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Outgoing Connections</label>
                <input
                  type="text"
                  value={updateObject.connections_out}
                  onChange={(e) => setUpdateObject({...updateObject, connections_out: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Incoming Connections</label>
                <input
                  type="text"
                  value={updateObject.connections_in}
                  onChange={(e) => setUpdateObject({...updateObject, connections_in: e.target.value})}
                  className="border border-gray-300 rounded-md px-3 py-2 w-full"
                />
              </div>
              <button
                onClick={updateExistingObject}
                disabled={loading || !updateObject.id}
                className="w-full bg-yellow-500 text-white px-4 py-2 rounded-md hover:bg-yellow-600 disabled:opacity-50"
              >
                {loading ? 'Updating...' : 'Update Object'}
              </button>
            </div>
          </div>
        </div>

        {/* Objects List */}
        <div className="bg-white p-6 rounded-lg shadow mt-6">
          <h2 className="text-xl font-semibold mb-4">Objects ({objects.length})</h2>
          {objects.length === 0 ? (
            <p className="text-gray-500">No objects found. Create some objects to get started!</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {objects.map(obj => (
                <div key={obj.id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-lg">{obj.name}</h3>
                    <button
                      onClick={() => deleteObject(obj.id)}
                      className="text-red-500 hover:text-red-700 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">Type: {obj.type}</p>
                  <p className="text-sm text-gray-600 mb-1">ID: {obj.id}</p>
                  <div className="text-sm">
                    <p className="text-blue-600">→ Out: {obj.connections_out.length > 0 ? obj.connections_out.join(', ') : 'none'}</p>
                    <p className="text-green-600">← In: {obj.connections_in.length > 0 ? obj.connections_in.join(', ') : 'none'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
