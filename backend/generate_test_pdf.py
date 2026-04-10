import asyncio
from playwright.async_api import async_playwright
import os

async def generate_pdf():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        
        html_content = """
        <html>
        <head><style>body { font-family: Arial; padding: 40px; }</style></head>
        <body>
            <h1>Financial Report: Al-Rashid Trading</h1>
            <p>CR Number: 1010123456</p>
            <p>Date: 2024-03-01</p>
            <p>Company Status: Active</p>
            <p>Address: Riyadh, Saudi Arabia</p>
            
            <h2>Income Statement 2023</h2>
            <table border="1" style="width:100%; border-collapse: collapse;">
                <tr><td>Revenue</td><td>5,000,000</td></tr>
                <tr><td>COGS</td><td>3,500,000</td></tr>
                <tr><td>Gross Profit</td><td>1,500,000</td></tr>
                <tr><td>Net Income</td><td>750,000</td></tr>
            </table>
            
            <h2>Balance Sheet 2023</h2>
            <table border="1" style="width:100%; border-collapse: collapse;">
                <tr><td>Current Assets</td><td>2,000,000</td></tr>
                <tr><td>Current Liabilities</td><td>1,000,000</td></tr>
                <tr><td>Total Assets</td><td>5,000,000</td></tr>
                <tr><td>Total Liabilities</td><td>2,000,000</td></tr>
                <tr><td>Equity</td><td>3,000,000</td></tr>
            </table>
        </body>
        </html>
        """
        
        await page.set_content(html_content)
        await page.pdf(path="real_test.pdf")
        await browser.close()
        print(f"Generated real_test.pdf in {os.getcwd()}")

if __name__ == "__main__":
    asyncio.run(generate_pdf())
