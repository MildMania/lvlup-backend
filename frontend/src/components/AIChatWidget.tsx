import React, { useState, useRef, useEffect } from 'react';
import { apiClient } from '../lib/apiClient';
import { MessageCircle, X, Send, Sparkles } from 'lucide-react';
import './AIChatWidget.css';

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

export const AIChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: '1',
      type: 'ai',
      content: '👋 Hi! I\'m your AI analytics assistant. Ask me about your metrics, trends, or any data insights!',
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [examples, setExamples] = useState<ExampleQuery[]>([]);
  const [showExamples, setShowExamples] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadExamples();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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
    setShowExamples(false);

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
        content: 'Sorry, I encountered an error. Please try again or rephrase your question.',
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

  const toggleWidget = () => {
    setIsOpen(!isOpen);
    if (!isOpen && messages.length === 1) {
      // Add a welcome message when first opened
      const welcomeMessage: ChatMessage = {
        id: 'welcome',
        type: 'ai',
        content: 'Try asking: "What\'s the user engagement this week?" or "Show me any unusual patterns"',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, welcomeMessage]);
    }
  };

  const renderMessage = (message: ChatMessage) => (
    <div key={message.id} className={`widget-message ${message.type}`}>
      <div className="widget-message-content">
        <div className="widget-message-text">{message.content}</div>
        
        {message.insights && message.insights.length > 0 && (
          <div className="widget-message-insights">
            <div className="insights-header">💡 Insights</div>
            {message.insights.map((insight, index) => (
              <div key={index} className="insight-item">{insight}</div>
            ))}
          </div>
        )}
        
        {message.data && message.data.values && (
          <div className="widget-message-data">
            <div className="data-header">📊 Data</div>
            <div className="data-list">
              {Object.entries(message.data.values).map(([metric, value]) => (
                <div key={metric} className="data-row">
                  <span className="data-metric">{metric.replace(/_/g, ' ')}</span>
                  <span className="data-value">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="widget-message-meta">
          <span className="widget-timestamp">{formatTimestamp(message.timestamp)}</span>
          {message.confidence !== undefined && (
            <span className="widget-confidence">
              {Math.round(message.confidence * 100)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Chat Widget */}
      <div className={`ai-chat-widget ${isOpen ? 'open' : ''}`}>
        {isOpen && (
          <div className="widget-container">
            {/* Header */}
            <div className="widget-header">
              <div className="widget-title">
                <Sparkles size={18} />
                <span>AI Assistant</span>
              </div>
              <div className="widget-actions">
                <button 
                  className="examples-toggle"
                  onClick={() => setShowExamples(!showExamples)}
                  title={showExamples ? 'Hide examples' : 'Show examples'}
                >
                  ?
                </button>
                <button 
                  className="widget-close"
                  onClick={toggleWidget}
                  title="Close chat"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Examples Panel */}
            {showExamples && (
              <div className="widget-examples">
                <div className="examples-title">Try asking:</div>
                {examples.slice(0, 2).map((category, index) => (
                  <div key={index} className="example-group">
                    <div className="example-category-title">{category.category}</div>
                    {category.queries.slice(0, 3).map((query, qIndex) => (
                      <button
                        key={qIndex}
                        className="example-button"
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

            {/* Messages */}
            <div className="widget-messages">
              {messages.map(renderMessage)}
              {isLoading && (
                <div className="widget-message ai">
                  <div className="widget-message-content">
                    <div className="widget-typing">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="widget-input">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask about your analytics..."
                disabled={isLoading}
                rows={1}
              />
              <button 
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className="widget-send"
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toggle Button */}
      <button 
        className={`ai-chat-toggle ${isOpen ? 'open' : ''}`}
        onClick={toggleWidget}
        title="AI Analytics Assistant"
      >
        {isOpen ? <X size={20} /> : <MessageCircle size={20} />}
        {!isOpen && (
          <div className="toggle-pulse"></div>
        )}
      </button>
    </>
  );
};