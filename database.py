import mysql.connector
from mysql.connector import Error
from typing import List, Dict, Optional
from config import MYSQL_CONFIG

class DatabaseManager:
    def __init__(self):
        self.connection = None
        
    def connect(self):
        """Establish database connection"""
        try:
            self.connection = mysql.connector.connect(**MYSQL_CONFIG)
            if self.connection.is_connected():
                print(f"✅ Successfully connected to MySQL database: {MYSQL_CONFIG['database']}")
                return True
        except Error as e:
            print(f"❌ Error connecting to MySQL: {e}")
            return False
    
    def disconnect(self):
        """Close database connection"""
        if self.connection and self.connection.is_connected():
            self.connection.close()
            print("🔌 MySQL connection closed")
    
    def get_tables(self) -> List[str]:
        """Get list of all tables in the database"""
        try:
            cursor = self.connection.cursor()
            cursor.execute("SHOW TABLES")
            tables = [table[0] for table in cursor.fetchall()]
            cursor.close()
            return tables
        except Error as e:
            print(f"❌ Error fetching tables: {e}")
            return []
    
    def get_table_schema(self, table_name: str) -> List[Dict]:
        """Get detailed schema for a specific table"""
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(f"DESCRIBE {table_name}")
            schema = cursor.fetchall()
            cursor.close()
            return schema
        except Error as e:
            print(f"❌ Error fetching schema for {table_name}: {e}")
            return []
    
    def get_full_schema(self) -> Dict:
        """Get complete database schema with all tables and columns"""
        schema = {}
        tables = self.get_tables()
        
        for table in tables:
            schema[table] = self.get_table_schema(table)
        
        return schema
    
    def get_schema_as_text(self) -> str:
        """Get schema formatted as text for LLM context"""
        full_schema = self.get_full_schema()
        schema_text = "DATABASE SCHEMA:\n\n"
        
        for table_name, columns in full_schema.items():
            schema_text += f"Table: {table_name}\n"
            schema_text += "Columns:\n"
            for col in columns:
                null_constraint = "NOT NULL" if col['Null'] == 'NO' else "NULL"
                key_info = f" ({col['Key']})" if col['Key'] else ""
                schema_text += f"  - {col['Field']}: {col['Type']} {null_constraint}{key_info}\n"
            schema_text += "\n"
        
        return schema_text
    
    def execute_query(self, query: str) -> Dict:
        """Execute SQL query and return results"""
        try:
            cursor = self.connection.cursor(dictionary=True)
            cursor.execute(query)
            
            # Check if it's a SELECT query
            if query.strip().upper().startswith('SELECT'):
                results = cursor.fetchall()
                columns = [desc[0] for desc in cursor.description] if cursor.description else []
                cursor.close()
                return {
                    'success': True,
                    'data': results,
                    'columns': columns,
                    'row_count': len(results),
                    'query_type': 'SELECT'
                }
            else:
                # For INSERT, UPDATE, DELETE
                self.connection.commit()
                affected_rows = cursor.rowcount
                cursor.close()
                return {
                    'success': True,
                    'affected_rows': affected_rows,
                    'query_type': query.strip().split()[0].upper(),
                    'message': f'Query executed successfully. {affected_rows} row(s) affected.'
                }
                
        except Error as e:
            return {
                'success': False,
                'error': str(e),
                'message': f'Error executing query: {str(e)}'
            }
    
    def test_connection(self) -> bool:
        """Test if connection is active"""
        try:
            if self.connection and self.connection.is_connected():
                return True
            return False
        except:
            return False

# Global database instance
db = DatabaseManager()
