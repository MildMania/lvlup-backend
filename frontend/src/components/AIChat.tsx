import React, { useState, useRef, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import './AIChat.css';

interface ChatMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  confidence?: number;
  data?: any;
  insights?: string[];
}

interface ExampleQuery {
  category: string;
  queries: string[];
}

export const AIChat: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'ai',
      content: 'Hello! I\'m your AI analytics assistant. Ask me anything about your game metrics, trends, or insights. For example, you could ask "What\'s the user engagement for the last week?" or "Show me any unusual patterns in revenue."',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [examples, setExamples] = useState<ExampleQuery[]>([]);
  const [showExamples, setShowExamples] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadExamples();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const loadExamples = async () => {
    try {
      const response = await apiClient.get('/ai-analytics/examples');
      setExamples(response.data.examples || []);
    } catch (error) {
      console.error('Failed to load examples:', error);
    }
  };

  const sendMessage = async (messageText?: string) => {
    const queryText = messageText || input.trim();
    if (!queryText || isLoading) return;

    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: queryText,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await apiClient.post('/ai-analytics/query', {
        query: queryText
      });

      const aiMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: response.data.response,
        timestamp: new Date(),
        confidence: response.data.confidence,
        data: response.data.data,
        insights: response.data.insights
      };

      setMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error('Failed to send message:', error);
      const errorMessage: ChatMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: 'Sorry, I encountered an error processing your request. Please try again or rephrase your question.',
        timestamp: new Date(),
        confidence: 0
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const renderMessage = (message: ChatMessage) => (
    <div key={message.id} className={`message ${message.type}`}>
      <div className="message-content">
        <div className="message-text">{message.content}</div>
        
        {message.insights && message.insights.length > 0 && (
          <div className="message-insights">
            <h4>💡 Insights:</h4>
            <ul>
              {message.insights.map((insight, index) => (
                <li key={index}>{insight}</li>
              ))}
            </ul>
          </div>
        )}
        
        {message.data && message.data.values && (
          <div className="message-data">
            <h4>📊 Data:</h4>
            <div className="data-grid">
              {Object.entries(message.data.values).map(([metric, value]) => (
                <div key={metric} className="data-item">
                  <span className="metric-name">{metric.replace(/_/g, ' ')}</span>
                  <span className="metric-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="message-meta">
          <span className="timestamp">{formatTimestamp(message.timestamp)}</span>
          {message.confidence !== undefined && (
            <span className="confidence">
              Confidence: {Math.round(message.confidence * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="ai-chat">
      <div className="chat-header">
        <h2>🤖 AI Analytics Assistant</h2>
        <button 
          className="examples-button"
          onClick={() => setShowExamples(!showExamples)}
        >
          {showExamples ? 'Hide Examples' : 'Show Examples'}
        </button>
      </div>

      {showExamples && (
        <div className="examples-panel">
          <h3>Example Queries:</h3>
          {examples.map((category, index) => (
            <div key={index} className="example-category">
              <h4>{category.category}</h4>
              {category.queries.map((query, qIndex) => (
                <button
                  key={qIndex}
                  className="example-query"
                  onClick={() => sendMessage(query)}
                  disabled={isLoading}
                >
                  {query}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      <div className="chat-messages">
        {messages.map(renderMessage)}
        {isLoading && (
          <div className="message ai loading">
            <div className="message-content">
              <div className="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder="Ask me about your analytics... (e.g., 'What's the engagement rate this week?')"
          disabled={isLoading}
          rows={2}
        />
        <button 
          onClick={() => sendMessage()}
          disabled={!input.trim() || isLoading}
          className="send-button"
        >
          Send
        </button>
      </div>
    </div>
  );
};