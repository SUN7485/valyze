import asyncio
import json
import sys
from pdf_generator import PDFGenerator

async def main():
    # Load test data
    json_path = r"D:\valyez final\json test.txt"
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    print(f"Generating PDF for: {data.get('company_name', 'Unknown')}")
    
    # Create PDF generator
    generator = PDFGenerator()
    
    # Generate PDF
    report_id = data.get('report_id', 'TEST-FIXES-001')
    result = await generator.generate_pdf(data, report_id)
    
    if result['success']:
        print(f"✅ PDF generated successfully: {result['pdf_path']}")
        print(f"   File size: {result['file_size_kb']} KB")
    else:
        print(f"❌ PDF generation failed: {result.get('error', 'Unknown error')}")

if __name__ == "__main__":
    asyncio.run(main())