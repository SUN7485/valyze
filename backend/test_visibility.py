import traceback

try:
    from utils.visibility import is_field_empty

    print("IMPORT OK")
    print(is_field_empty(None))
    print(is_field_empty("N/A"))
    print(is_field_empty("test"))
except Exception as e:
    traceback.print_exc()
