// ============ P08_Operations.jsx ============
import React from 'react'
import FieldInput from '../components/FieldInput'

export default function P08_Operations() {
    return (
        <div className="p-6 space-y-6 animate-in fade-in duration-500">
            <div className="border-b border-gray-100 dark:border-white/5 pb-4">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">Operations Overview</h2>
                <p className="text-sm text-gray-500 dark:text-slate-400 mt-1 italic">
                    Registration activities, industry codes, operational scale, and supply chain.
                </p>
            </div>

            {/* Registration Activities */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Registration Activities
                </h3>
                <div className="grid grid-cols-1 gap-6">
                    <FieldInput
                        label="Registration Activities Description"
                        fieldName="registration_activities_description"
                        type="textarea"
                        rows={4}
                        helpText="As stated in the commercial registration / license."
                    />
                    <FieldInput
                        label="Full Operational Description"
                        fieldName="activities_full_description"
                        type="textarea"
                        rows={5}
                        helpText="Comprehensive breakdown of actual day-to-day services and products."
                    />
                </div>
            </div>

            {/* Industry Classification */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Industry Classification Codes
                </h3>
                <div className="grid grid-cols-3 gap-6">
                    <FieldInput label="SIC Codes" fieldName="sic_codes" type="text" placeholder="e.g. 5411" />
                    <FieldInput label="NACE Codes" fieldName="nace_codes" type="text" placeholder="e.g. 46.71" />
                    <FieldInput label="HS Codes" fieldName="hs_codes" type="text" placeholder="e.g. 7308.90" />
                    <FieldInput label="NACE Description" fieldName="nace_description" type="text" />
                    <FieldInput label="HS Description" fieldName="hs_description" type="text" />
                </div>
            </div>

            {/* Operational Scale */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-6">
                    Operational Scale
                </h3>
                <div className="grid grid-cols-3 gap-6">
                    <FieldInput label="Employee Count" fieldName="employee_count" type="text" />
                    <FieldInput label="Primary Workforce Location" fieldName="employee_location" type="text" placeholder="e.g. Cairo HQ" />
                    <FieldInput label="Total Facilities / Sites" fieldName="facilities_count" type="text" />
                    <FieldInput label="Main Facility Location" fieldName="main_facility_location" type="text" />
                    <FieldInput label="Markets Served Count" fieldName="markets_count" type="text" />
                    <FieldInput label="Target Regions" fieldName="markets_regions" type="text" placeholder="e.g. GCC, Africa" />
                </div>

                {/* Physical Assets */}
                <div className="mt-8 pt-6 border-t border-gray-100 dark:border-white/5">
                    <h4 className="text-xs font-black text-[#1a5f7a] dark:text-blue-400 uppercase tracking-[0.15em] mb-4">
                        Physical Assets
                    </h4>
                    <div className="grid grid-cols-3 gap-6">
                        <FieldInput label="Premises (type)" fieldName="premises_type" type="text" placeholder="e.g. Warehouse, Office" />
                        <FieldInput label="Premises (size)" fieldName="premises_size" type="text" placeholder="e.g. 500 sqm" />
                        <FieldInput label="Premises (owned/rental)" fieldName="premises_owned_rental" type="text" placeholder="e.g. Owned, Rental" />
                        <FieldInput label="Vehicles" fieldName="vehicles" type="text" placeholder="e.g. 5 trucks" />
                        <FieldInput label="Equipment" fieldName="equipment" type="text" placeholder="e.g. Forklifts, Generators" />
                        <FieldInput label="Brands" fieldName="brands" type="text" placeholder="e.g. Brand A, Brand B" />
                    </div>
                </div>
            </div>

            {/* Supply Chain — 2 columns */}
            <div className="bg-white dark:bg-white/5 rounded-2xl shadow-sm border border-gray-100 dark:border-white/10 p-8">
                <h3 className="text-xs font-black text-gray-400 dark:text-slate-500 uppercase tracking-[0.2em] mb-8">
                    Supply Chain
                </h3>

                <div className="grid grid-cols-2 gap-8">
                    {/* LEFT — Purchasing */}
                    <div className="border border-[#1a5f7a]/20 dark:border-blue-500/20 rounded-2xl overflow-hidden">
                        <div className="bg-[#1a5f7a] dark:bg-blue-600/80 px-6 py-4 text-white font-black text-sm tracking-widest">
                            📥 Purchasing (Inbound)
                        </div>
                        <div className="p-6 space-y-4">
                            <FieldInput
                                label="Main Suppliers"
                                fieldName="main_suppliers"
                                type="textarea"
                                rows={2}
                                placeholder="e.g. Al-Salma Pak, Happy House..."
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FieldInput label="Local Sourcing %" fieldName="local_purchasing_pct" type="text" placeholder="e.g. 60" />
                                <FieldInput label="Import %" fieldName="import_purchasing_pct" type="text" placeholder="e.g. 40" />
                            </div>
                            <FieldInput label="Local Sourcing Detail" fieldName="local_purchasing_detail" type="textarea" rows={2} />
                            <FieldInput label="Import Countries" fieldName="import_countries" type="text" placeholder="e.g. China, Germany" />
                            <FieldInput label="Imported Items" fieldName="import_items" type="text" />
                            <FieldInput label="Payment Method" fieldName="supplier_payment_method" type="text" placeholder="e.g. LC, TT, Cash" />
                            <FieldInput label="Payment Terms" fieldName="supplier_payment_terms" type="text" placeholder="e.g. 30–45 days" />
                            <FieldInput label="Suppliers Number" fieldName="suppliers_number" type="text" placeholder="e.g. 15" />
                        </div>
                    </div>

                    {/* RIGHT — Sales */}
                    <div className="border border-[#2d8a6e]/20 dark:border-emerald-500/20 rounded-2xl overflow-hidden">
                        <div className="bg-[#2d8a6e] dark:bg-emerald-600/80 px-6 py-4 text-white font-black text-sm tracking-widest">
                            📤 Sales (Outbound)
                        </div>
                        <div className="p-6 space-y-4">
                            <FieldInput
                                label="Key Customers"
                                fieldName="key_customers"
                                type="textarea"
                                rows={2}
                                placeholder="e.g. Abela Egypt, Alpha Group..."
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <FieldInput label="Local Sales %" fieldName="local_sales_pct" type="text" placeholder="e.g. 70" />
                                <FieldInput label="Export %" fieldName="export_sales_pct" type="text" placeholder="e.g. 30" />
                            </div>
                            <FieldInput label="Local Sales Detail" fieldName="local_sales_detail" type="textarea" rows={2} />
                            <FieldInput label="Export Countries" fieldName="export_countries" type="text" placeholder="e.g. UAE, Qatar" />
                            <FieldInput label="Exported Items" fieldName="export_items" type="text" />
                            <FieldInput label="Payment Method" fieldName="customer_payment_method" type="text" placeholder="e.g. Net 30, LC" />
                            <FieldInput label="Payment Terms" fieldName="customer_payment_terms" type="text" placeholder="e.g. 30–90 days from invoice" />
                            <FieldInput label="Clients Number" fieldName="clients_number" type="text" placeholder="e.g. 50" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}