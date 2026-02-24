from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, List
import uvicorn

from database import db
from llm_service import llm_service
from sql_validator import validator
from config import FRONTEND_URL, BACKEND_PORT

# Initialize FastAPI app
app = FastAPI(
    title="Natural Language to SQL API",
    description="Convert natural language queries to SQL and execute them safely",
    version="1.0.0"
)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL, "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Pydantic models for request/response
class QueryRequest(BaseModel):
    query: str
    operation_type: Optional[str] = "any"

class ExecuteRequest(BaseModel):
    sql: str

class QueryResponse(BaseModel):
    success: bool
    sql: Optional[str] = None
    explanation: Optional[str] = None
    warnings: Optional[List[str]] = None
    errors: Optional[List[str]] = None
    risk_level: Optional[str] = None
    message: Optional[str] = None

# Startup event
@app.on_event("startup")
async def startup_event():
    """Connect to database on startup"""
    print("🚀 Starting Natural Language to SQL API...")
    if db.connect():
        print("✅ Database connection established")
    else:
        print("❌ Failed to connect to database")

# Shutdown event
@app.on_event("shutdown")
async def shutdown_event():
    """Close database connection on shutdown"""
    db.disconnect()
    print("👋 API shutdown complete")

# Health check endpoint
@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "message": "Natural Language to SQL API is running",
        "database_connected": db.test_connection()
    }

# Get database schema
@app.get("/api/schema")
async def get_schema():
    """Get complete database schema"""
    try:
        full_schema = db.get_full_schema()
        tables = db.get_tables()
        
        return {
            "success": True,
            "tables": tables,
            "schema": full_schema,
            "table_count": len(tables)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching schema: {str(e)}")

# Get specific table details
@app.get("/api/schema/{table_name}")
async def get_table_schema(table_name: str):
    """Get schema for a specific table"""
    try:
        schema = db.get_table_schema(table_name)
        if not schema:
            raise HTTPException(status_code=404, detail=f"Table '{table_name}' not found")
        
        return {
            "success": True,
            "table_name": table_name,
            "columns": schema
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching table schema: {str(e)}")

# Generate SQL from natural language
@app.post("/api/generate-sql", response_model=QueryResponse)
async def generate_sql(request: QueryRequest):
    """
    Generate SQL query from natural language
    
    This endpoint:
    1. Takes natural language input
    2. Uses LLM to generate SQL
    3. Validates the generated SQL
    4. Returns SQL with explanation and warnings
    """
    try:
        # Get database schema
        schema = db.get_schema_as_text()
        
        # Generate SQL using LLM
        llm_response = llm_service.generate_sql(
            user_query=request.query,
            schema=schema,
            operation_type=request.operation_type
        )
        
        if not llm_response['success']:
            return QueryResponse(
                success=False,
                message=llm_response.get('error', 'Failed to generate SQL'),
                errors=[llm_response.get('error', 'Unknown error')]
            )
        
        sql = llm_response['sql']
        
        # Validate SQL
        validation = validator.validate_query(sql)
        
        # Add LIMIT if missing for SELECT queries
        if validation['query_type'] == 'SELECT':
            sql = validator.add_limit_if_missing(sql)
        
        # Sanitize query
        sql = validator.sanitize_query(sql)
        
        return QueryResponse(
            success=validation['is_valid'],
            sql=sql,
            explanation=llm_response['explanation'],
            warnings=validation['warnings'],
            errors=validation['errors'],
            risk_level=validation['risk_level']
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating SQL: {str(e)}")

# Execute SQL query
@app.post("/api/execute-sql")
async def execute_sql(request: ExecuteRequest):
    """
    Execute SQL query after user approval
    
    This endpoint:
    1. Re-validates the SQL
    2. Executes if valid
    3. Returns results or error
    """
    try:
        sql = request.sql
        
        # Re-validate before execution
        validation = validator.validate_query(sql)
        
        if not validation['is_valid']:
            return {
                "success": False,
                "message": "Query validation failed",
                "errors": validation['errors']
            }
        
        # Execute query
        result = db.execute_query(sql)
        
        return result
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error executing SQL: {str(e)}")

# Test database connection
@app.get("/api/test-connection")
async def test_connection():
    """Test database connection"""
    is_connected = db.test_connection()
    
    if not is_connected:
        # Try to reconnect
        is_connected = db.connect()
    
    return {
        "success": is_connected,
        "message": "Database connected" if is_connected else "Database connection failed"
    }

# Run the application
if __name__ == "__main__":
    print(f"""
    ╔═══════════════════════════════════════════════════════╗
    ║   Natural Language to SQL API                        ║
    ║   Backend Server Starting...                         ║
    ╚═══════════════════════════════════════════════════════╝
    """)
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=BACKEND_PORT,
        reload=True,
        log_level="info"
    )
