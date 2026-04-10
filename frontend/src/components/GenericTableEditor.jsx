import React, { useState } from 'react'
import { Plus, Edit2, Trash2, Check, X } from 'lucide-react'

export default function GenericTableEditor({ 
  title,
  data = [], 
  onSave,
  columns = [],
  emptyMessage = "No items added. Click Add to create one."
}) {
  const [items, setItems] = useState(data)
  const [editingIndex, setEditingIndex] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({})

  const handleFieldChange = (key, value) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const handleAdd = () => {
    const newItem = { ...formData }
    const updated = [...items, newItem]
    setItems(updated)
    onSave(updated)
    setFormData({})
    setIsAdding(false)
  }

  const handleDelete = (index) => {
    const updated = items.filter((_, i) => i !== index)
    setItems(updated)
    onSave(updated)
  }

  const handleEdit = (index) => {
    setFormData(items[index])
    setEditingIndex(index)
    setIsAdding(true)
  }

  const handleSaveEdit = () => {
    const updated = [...items]
    updated[editingIndex] = formData
    setItems(updated)
    onSave(updated)
    setIsAdding(false)
    setEditingIndex(null)
    setFormData({})
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingIndex(null)
    setFormData({})
  }

  const getFieldValue = (item, key) => {
    const col = columns.find(c => c.key === key)
    const value = item[key]
    if (col?.type === 'select' && col.options) {
      const opt = col.options.find(o => o.value === value)
      return opt?.label || value || '-'
    }
    return value || '-'
  }

  const renderInput = (col, value) => {
    if (col.type === 'select' && col.options) {
      return (
        <select
          value={value || ''}
          onChange={(e) => handleFieldChange(col.key, e.target.value)}
          className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
        >
          <option value="">Select...</option>
          {col.options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      )
    }
    if (col.type === 'date') {
      return (
        <input
          type="date"
          value={value || ''}
          onChange={(e) => handleFieldChange(col.key, e.target.value)}
          className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
        />
      )
    }
    return (
      <input
        type={col.type || 'text'}
        value={value || ''}
        onChange={(e) => handleFieldChange(col.key, e.target.value)}
        placeholder={col.placeholder || ''}
        className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
      />
    )
  }

  const requiredCols = columns.filter(c => c.required)
  const canSave = requiredCols.every(col => formData[col.key])

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
        <h4 className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">
          {title}
        </h4>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-slate-400 font-black uppercase text-[9px] tracking-wider">
            <tr>
              {columns.map(col => (
                <th key={col.key} className="px-4 py-3">{col.label}</th>
              ))}
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-white/5">
                {columns.map(col => (
                  <td key={col.key} className="px-4 py-3">
                    <span className="text-gray-700 dark:text-slate-300">
                      {getFieldValue(item, col.key)}
                    </span>
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => handleEdit(index)}
                    className="p-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/20 rounded-lg"
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDelete(index)}
                    className="p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-500/20 rounded-lg ml-1"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-gray-400">
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Add/Edit Form */}
      {isAdding && (
        <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border-t border-blue-100 dark:border-blue-500/20">
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-bold text-blue-700 dark:text-blue-400">
              {editingIndex !== null ? `Edit ${title.slice(0, -1)}` : `Add New ${title.slice(0, -1)}`}
            </span>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 dark:hover:bg-white/10 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={editingIndex !== null ? handleSaveEdit : handleAdd}
                disabled={!canSave}
                className="px-3 py-1.5 text-xs font-bold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {editingIndex !== null ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </div>
          
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${Math.min(columns.length, 4)}, 1fr)` }}>
            {columns.map(col => (
              <div key={col.key}>
                <label className="block text-[10px] font-medium text-gray-500 mb-1">
                  {col.label} {col.required && '*'}
                </label>
                {renderInput(col, formData[col.key])}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add Button */}
      {!isAdding && (
        <div className="p-4 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={() => {
              const empty = {}
              columns.forEach(col => empty[col.key] = '')
              setFormData(empty)
              setIsAdding(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:opacity-90"
          >
            <Plus size={14} /> Add {title.slice(0, -1)}
          </button>
        </div>
      )}
    </div>
  )
}