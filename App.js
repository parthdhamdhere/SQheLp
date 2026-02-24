import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { 
  Database, 
  Send, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  Loader2,
  Table as TableIcon,
  Play,
  X,
  RefreshCw
} from 'lucide-react';
import './App.css';

const API_BASE_URL = 'http://localhost:8000/api';

function App() {
  // State management
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [chatHistory, setChatHistory] = useState([]);
  const [pendingQuery, setPendingQuery] = useState(null);
  const [executionResult, setExecutionResult] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState('checking');
  
  const chatEndRef = useRef(null);

  // Load schema on mount
  useEffect(() => {
    checkConnection();
    loadSchema();
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory]);

  // Check database connection
  const checkConnection = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/test-connection`);
      setConnectionStatus(response.data.success ? 'connected' : 'disconnected');
    } catch (error) {
      setConnectionStatus('error');
    }
  };

  // Load database schema
  const loadSchema = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/schema`);
      setSchema(response.data);
    } catch (error) {
      console.error('Error loading schema:', error);
    }
  };

  // Handle natural language query submission
  const handleSubmitQuery = async (e) => {
    e.preventDefault();
    if (!userQuery.trim() || loading) return;

    const query = userQuery.trim();
    setUserQuery('');
    setLoading(true);

    // Add user message to chat
    const userMessage = {
      type: 'user',
      content: query,
      timestamp: new Date()
    };
    setChatHistory(prev => [...prev, userMessage]);

    try {
      // Call API to generate SQL
      const response = await axios.post(`${API_BASE_URL}/generate-sql`, {
        query: query
      });

      if (response.data.success) {
        // SQL generated successfully
        setPendingQuery({
          sql: response.data.sql,
          explanation: response.data.explanation,
          warnings: response.data.warnings || [],
          errors: response.data.errors || [],
          risk_level: response.data.risk_level
        });

        // Add assistant response to chat
        const assistantMessage = {
          type: 'assistant',
          content: response.data.explanation,
          sql: response.data.sql,
          warnings: response.data.warnings || [],
          risk_level: response.data.risk_level,
          timestamp: new Date()
        };
        setChatHistory(prev => [...prev, assistantMessage]);
      } else {
        // Error generating SQL
        const errorMessage = {
          type: 'error',
          content: response.data.message || 'Failed to generate SQL',
          errors: response.data.errors || [],
          timestamp: new Date()
        };
        setChatHistory(prev => [...prev, errorMessage]);
      }
    } catch (error) {
      const errorMessage = {
        type: 'error',
        content: error.response?.data?.detail || 'An error occurred',
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Execute approved SQL query
  const executeQuery = async () => {
    if (!pendingQuery) return;

    setLoading(true);
    setExecutionResult(null);

    try {
      const response = await axios.post(`${API_BASE_URL}/execute-sql`, {
        sql: pendingQuery.sql
      });

      setExecutionResult(response.data);

      // Add execution result to chat
      const resultMessage = {
        type: 'result',
        content: response.data.success ? 'Query executed successfully!' : 'Query execution failed',
        result: response.data,
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, resultMessage]);

      // Clear pending query if successful
      if (response.data.success) {
        setPendingQuery(null);
        // Reload schema in case structure changed
        loadSchema();
      }
    } catch (error) {
      const errorMessage = {
        type: 'error',
        content: error.response?.data?.detail || 'Failed to execute query',
        timestamp: new Date()
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  // Cancel pending query
  const cancelQuery = () => {
    setPendingQuery(null);
    const cancelMessage = {
      type: 'system',
      content: 'Query execution cancelled',
      timestamp: new Date()
    };
    setChatHistory(prev => [...prev, cancelMessage]);
  };

  // Render chat message
  const renderMessage = (message, index) => {
    switch (message.type) {
      case 'user':
        return (
          <div key={index} className="message user-message fade-in">
            <div className="message-content">{message.content}</div>
          </div>
        );

      case 'assistant':
        return (
          <div key={index} className="message assistant-message fade-in">
            <div className="message-header">
              <Database size={16} />
              <span>SQL Assistant</span>
            </div>
            <div className="message-content">
              <p>{message.content}</p>
              {message.sql && (
                <div className="sql-block">
                  <code>{message.sql}</code>
                </div>
              )}
              {message.warnings && message.warnings.length > 0 && (
                <div className="warnings">
                  {message.warnings.map((warning, i) => (
                    <div key={i} className="warning-item">
                      <AlertTriangle size={14} />
                      <span>{warning}</span>
                    </div>
                  ))}
                </div>
              )}
              {message.risk_level && (
                <div className={`risk-badge risk-${message.risk_level}`}>
                  Risk: {message.risk_level}
                </div>
              )}
            </div>
          </div>
        );

      case 'result':
        return (
          <div key={index} className="message result-message fade-in">
            <div className="message-header">
              {message.result.success ? (
                <CheckCircle size={16} className="text-green" />
              ) : (
                <XCircle size={16} className="text-red" />
              )}
              <span>{message.content}</span>
            </div>
            {message.result.success && message.result.data && (
              <div className="result-table-container">
                <table className="result-table">
                  <thead>
                    <tr>
                      {message.result.columns?.map((col, i) => (
                        <th key={i}>{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {message.result.data.map((row, i) => (
                      <tr key={i}>
                        {message.result.columns?.map((col, j) => (
                          <td key={j}>{row[col]}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="result-info">
                  {message.result.row_count} row(s) returned
                </div>
              </div>
            )}
            {message.result.success && message.result.affected_rows !== undefined && (
              <div className="result-info">
                {message.result.affected_rows} row(s) affected
              </div>
            )}
            {!message.result.success && (
              <div className="error-details">
                {message.result.message}
              </div>
            )}
          </div>
        );

      case 'error':
        return (
          <div key={index} className="message error-message fade-in">
            <div className="message-header">
              <XCircle size={16} />
              <span>Error</span>
            </div>
            <div className="message-content">{message.content}</div>
            {message.errors && message.errors.length > 0 && (
              <ul className="error-list">
                {message.errors.map((error, i) => (
                  <li key={i}>{error}</li>
                ))}
              </ul>
            )}
          </div>
        );

      case 'system':
        return (
          <div key={index} className="message system-message fade-in">
            <span>{message.content}</span>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <Database size={28} />
            <div>
              <h1>SQheLp</h1>
              <p>Democratize data access for everyone</p>
            </div>
          </div>
          <div className="header-right">
            <div className={`connection-status status-${connectionStatus}`}>
              <div className="status-dot"></div>
              <span>
                {connectionStatus === 'connected' && 'Connected'}
                {connectionStatus === 'disconnected' && 'Disconnected'}
                {connectionStatus === 'checking' && 'Checking...'}
                {connectionStatus === 'error' && 'Error'}
              </span>
            </div>
            <button className="icon-button" onClick={() => { loadSchema(); checkConnection(); }}>
              <RefreshCw size={18} />
            </button>
          </div>
        </div>
      </header>

      <div className="main-content">
        {/* Sidebar - Schema Viewer */}
        <aside className="sidebar">
          <div className="sidebar-header">
            <TableIcon size={18} />
            <h2>Database Schema</h2>
          </div>
          {schema ? (
            <div className="schema-list">
              {schema.tables.map(table => (
                <div key={table} className="schema-table">
                  <div className="table-name">
                    <TableIcon size={14} />
                    <span>{table}</span>
                  </div>
                  <div className="table-columns">
                    {schema.schema[table]?.map((col, i) => (
                      <div key={i} className="column-item">
                        <span className="column-name">{col.Field}</span>
                        <span className="column-type">{col.Type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="loading-schema">
              <Loader2 size={24} className="spin" />
              <p>Loading schema...</p>
            </div>
          )}
        </aside>

        {/* Main Chat Area */}
        <main className="chat-container">
          <div className="chat-messages">
            {chatHistory.length === 0 ? (
              <div className="empty-state">
                <Database size={48} />
                <h2>Welcome to SQheLp</h2>
                <p>Ask questions about your data in plain English!</p>
                <div className="example-queries">
                  <p className="example-title">Try asking:</p>
                  <button onClick={() => setUserQuery("Show all products with price greater than 1000")}>
                    "Show all products with price greater than 1000"
                  </button>
                  <button onClick={() => setUserQuery("Add a new supplier named ABC Corp from Pune")}>
                    "Add a new supplier named ABC Corp from Pune"
                  </button>
                  <button onClick={() => setUserQuery("Update the price of product ID 5 to 2500")}>
                    "Update the price of product ID 5 to 2500"
                  </button>
                </div>
              </div>
            ) : (
              chatHistory.map((message, index) => renderMessage(message, index))
            )}
            {loading && (
              <div className="message assistant-message fade-in">
                <div className="message-header">
                  <Loader2 size={16} className="spin" />
                  <span>Generating SQL...</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Pending Query Approval */}
          {pendingQuery && !loading && (
            <div className="approval-panel fade-in">
              <div className="approval-header">
                <AlertTriangle size={20} />
                <h3>Review and Approve Query</h3>
              </div>
              <div className="approval-content">
                <div className="sql-preview">
                  <code>{pendingQuery.sql}</code>
                </div>
                <p className="approval-explanation">{pendingQuery.explanation}</p>
                {pendingQuery.warnings.length > 0 && (
                  <div className="approval-warnings">
                    {pendingQuery.warnings.map((warning, i) => (
                      <div key={i} className="warning-item">
                        <AlertTriangle size={14} />
                        <span>{warning}</span>
                      </div>
                    ))}
                  </div>
                )}
                {pendingQuery.errors.length > 0 && (
                  <div className="approval-errors">
                    {pendingQuery.errors.map((error, i) => (
                      <div key={i} className="error-item">
                        <XCircle size={14} />
                        <span>{error}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="approval-actions">
                <button 
                  className="btn btn-cancel" 
                  onClick={cancelQuery}
                  disabled={loading}
                >
                  <X size={18} />
                  Cancel
                </button>
                <button 
                  className="btn btn-execute" 
                  onClick={executeQuery}
                  disabled={loading || pendingQuery.errors.length > 0}
                >
                  <Play size={18} />
                  Execute Query
                </button>
              </div>
            </div>
          )}

          {/* Input Form */}
          <form className="chat-input-form" onSubmit={handleSubmitQuery}>
            <input
              type="text"
              className="chat-input"
              placeholder="Ask a question about your data... (e.g., 'Show all orders from last month')"
              value={userQuery}
              onChange={(e) => setUserQuery(e.target.value)}
              disabled={loading}
            />
            <button 
              type="submit" 
              className="send-button"
              disabled={loading || !userQuery.trim()}
            >
              {loading ? (
                <Loader2 size={20} className="spin" />
              ) : (
                <Send size={20} />
              )}
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

export default App;
