from fastapi import HTTPException as FastAPIHTTPException
from starlette.exceptions import HTTPException as StarletteHTTPException

print("isinstance:", isinstance(FastAPIHTTPException(500), StarletteHTTPException))
