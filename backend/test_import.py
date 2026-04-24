from main import app
from api.upload import router as upload_router
from api.report import router as report_router
from api.pdf import router as pdf_router
from api.export import router as export_router
from api.search import router as search_router
from api.cloud import router as cloud_router
from database.crud import get_all_reports
from database.db import init_db
print("Backend imports OK")
print("All routers imported")
print("Database CRUD imported")