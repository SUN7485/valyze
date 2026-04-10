import React, { useState } from 'react'
import { Plus, Edit2, Trash2, X, Check } from 'lucide-react'

const COUNTRY_OPTIONS = [
  { value: '🇦🇪', label: '🇦🇪 UAE (+971)', code: '+971' },
  { value: '🇸🇦', label: '🇸🇦 Saudi Arabia (+966)', code: '+966' },
  { value: '🇪🇬', label: '🇪🇬 Egypt (+20)', code: '+20' },
  { value: '🇰🇼', label: '🇰🇼 Kuwait (+965)', code: '+965' },
  { value: '🇶🇦', label: '🇶🇦 Qatar (+974)', code: '+974' },
  { value: '🇧🇭', label: '🇧🇭 Bahrain (+973)', code: '+973' },
  { value: '🇴🇲', label: '🇴🇲 Oman (+968)', code: '+968' },
  { value: '🇯🇴', label: '🇯🇴 Jordan (+962)', code: '+962' },
  { value: '🇱🇧', label: '🇱🇧 Lebanon (+961)', code: '+961' },
  { value: '🇮🇶', label: '🇮🇶 Iraq (+964)', code: '+964' },
  { value: '🌍', label: '🌍 Other', code: '' },
]

const TYPE_OPTIONS = [
  { value: 'Mobile', label: '📱 Mobile', icon: '📱' },
  { value: 'Phone', label: '📞 Phone', icon: '📞' },
  { value: 'Fax', label: '📠 Fax', icon: '📠' },
  { value: 'WhatsApp', label: '💬 WhatsApp', icon: '💬' },
]

export default function PhoneNumbersEditor({ data = [], onSave }) {
  const [items, setItems] = useState(data)
  const [editingIndex, setEditingIndex] = useState(null)
  const [isAdding, setIsAdding] = useState(false)
  const [formData, setFormData] = useState({
    country_flag: '🇦🇪',
    country_code: '+971',
    phone_number: '',
    national_id: '',
    number_type: 'Mobile',
    contact_person: '',
    comments: '',
    is_primary: 'false'
  })

  const handleAdd = () => {
    const newItem = { ...formData }
    const updated = [...items, newItem]
    setItems(updated)
    onSave(updated)
    setFormData({
      country_flag: '🇦🇪',
      country_code: '+971',
      phone_number: '',
      national_id: '',
      number_type: 'Mobile',
      contact_person: '',
      comments: '',
      is_primary: 'false'
    })
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
    setFormData({
      country_flag: '🇦🇪',
      country_code: '+971',
      phone_number: '',
      national_id: '',
      number_type: 'Mobile',
      contact_person: '',
      comments: '',
      is_primary: 'false'
    })
  }

  const handleCancel = () => {
    setIsAdding(false)
    setEditingIndex(null)
    setFormData({
      country_flag: '🇦🇪',
      country_code: '+971',
      phone_number: '',
      national_id: '',
      number_type: 'Mobile',
      contact_person: '',
      comments: '',
      is_primary: 'false'
    })
  }

  const handleCountryChange = (flag) => {
    const country = COUNTRY_OPTIONS.find(c => c.value === flag)
    setFormData({ 
      ...formData, 
      country_flag: flag,
      country_code: country?.code || ''
    })
  }

  return (
    <div className="bg-white dark:bg-white/5 rounded-2xl border border-gray-100 dark:border-white/10 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-white/10 bg-gray-50 dark:bg-white/5">
        <h4 className="text-[10px] font-black text-gray-400 dark:text-slate-500 uppercase tracking-widest">
          Phone Numbers
        </h4>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-gray-50 dark:bg-white/5 text-gray-500 dark:text-slate-400 font-black uppercase text-[9px] tracking-wider">
            <tr>
              <th className="px-4 py-3">Country</th>
              <th className="px-4 py-3">Code</th>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">National ID</th>
              <th className="px-4 py-3">Primary</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-white/10">
            {items.map((item, index) => (
              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-white/5">
                <td className="px-4 py-3">
                  <span className="text-lg">{item.country_flag}</span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                  {item.country_code}
                </td>
                <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                  {item.phone_number}
                  {item.comments && (
                    <div className="text-[10px] text-gray-400 italic">{item.comments}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-gray-100 dark:bg-white/10 text-xs">
                    {TYPE_OPTIONS.find(t => t.value === item.number_type)?.icon || '📞'} {item.number_type}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-600 dark:text-slate-300">
                  {item.contact_person || '-'}
                </td>
                <td className="px-4 py-3 text-gray-500 dark:text-slate-400 text-[10px]">
                  {item.national_id || '-'}
                </td>
                <td className="px-4 py-3">
                  {item.is_primary === 'true' ? (
                    <span className="text-amber-500">⭐ Primary</span>
                  ) : (
                    <span className="text-gray-300">-</span>
                  )}
                </td>
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
                <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                  No phone numbers added. Click "Add Phone Number" to add one.
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
              {editingIndex !== null ? 'Edit Phone Number' : 'Add New Phone Number'}
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
                disabled={!formData.phone_number}
                className="px-3 py-1.5 text-xs font-bold text-white bg-primary rounded-lg hover:opacity-90 disabled:opacity-50"
              >
                {editingIndex !== null ? 'Save Changes' : 'Add'}
              </button>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Country</label>
              <select
                value={formData.country_flag}
                onChange={(e) => handleCountryChange(e.target.value)}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
              >
                {COUNTRY_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Code</label>
              <input
                type="text"
                value={formData.country_code}
                onChange={(e) => setFormData({ ...formData, country_code: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
                placeholder="+971"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Number *</label>
              <input
                type="text"
                value={formData.phone_number}
                onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
                placeholder="50 123 4567"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Type</label>
              <select
                value={formData.number_type}
                onChange={(e) => setFormData({ ...formData, number_type: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
              >
                {TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Contact Person</label>
              <input
                type="text"
                value={formData.contact_person}
                onChange={(e) => setFormData({ ...formData, contact_person: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
                placeholder="Manager Name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">National ID</label>
              <input
                type="text"
                value={formData.national_id}
                onChange={(e) => setFormData({ ...formData, national_id: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
                placeholder="1234567890"
              />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-1">Primary</label>
              <select
                value={formData.is_primary}
                onChange={(e) => setFormData({ ...formData, is_primary: e.target.value })}
                className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
              >
                <option value="false">❌ No</option>
                <option value="true">✅ Yes</option>
              </select>
            </div>
          </div>
          
          <div className="mt-3">
            <label className="block text-[10px] font-medium text-gray-500 mb-1">Comments</label>
            <input
              type="text"
              value={formData.comments}
              onChange={(e) => setFormData({ ...formData, comments: e.target.value })}
              className="w-full px-2 py-2 text-sm border border-gray-200 dark:border-white/10 rounded-lg bg-white dark:bg-white/5"
              placeholder="Direct line, office hours, etc."
            />
          </div>
        </div>
      )}

      {/* Add Button */}
      {!isAdding && (
        <div className="p-4 border-t border-gray-100 dark:border-white/10">
          <button
            onClick={() => {
              setFormData({
                country_flag: '🇦🇪',
                country_code: '+971',
                phone_number: '',
                national_id: '',
                number_type: 'Mobile',
                contact_person: '',
                comments: '',
                is_primary: items.length === 0 ? 'true' : 'false'
              })
              setIsAdding(true)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-white text-xs font-bold rounded-lg hover:opacity-90"
          >
            <Plus size={14} /> Add Phone Number
          </button>
        </div>
      )}
    </div>
  )
}