"""Validate the planned REST document; does not start or implement an API."""
from pathlib import Path
from openapi_spec_validator import validate
from openapi_spec_validator.readers import read_from_filename

root = Path(__file__).resolve().parent.parent
spec, base_uri = read_from_filename(str(root / "shared" / "openapi.json"))
validate(spec, base_uri=base_uri)
print("OpenAPI 3.1 specification is valid.")
