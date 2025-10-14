-- AI Context Management Tables

-- Release and feature tracking
CREATE TABLE releases (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    version VARCHAR(50) NOT NULL,
    release_date DATETIME NOT NULL,
    rollout_percentage INTEGER DEFAULT 100,
    status ENUM('planned', 'released', 'rolled_back') DEFAULT 'planned',
    notes TEXT,
    created_by VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Individual features within releases
CREATE TABLE release_features (
    id VARCHAR(36) PRIMARY KEY,
    release_id VARCHAR(36) NOT NULL,
    feature_name VARCHAR(255) NOT NULL,
    feature_type ENUM('gameplay', 'ui', 'monetization', 'performance', 'bugfix', 'balance') NOT NULL,
    description TEXT,
    expected_impact TEXT,
    expected_metrics JSON, -- ['retention', 'revenue', 'engagement']
    impact_direction ENUM('positive', 'negative', 'neutral', 'unknown') DEFAULT 'unknown',
    confidence_level INTEGER DEFAULT 50, -- 0-100
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (release_id) REFERENCES releases(id) ON DELETE CASCADE
);

-- Marketing campaigns and external events
CREATE TABLE business_events (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    event_type ENUM('campaign', 'external', 'seasonal', 'competitor', 'platform') NOT NULL,
    event_name VARCHAR(255) NOT NULL,
    description TEXT,
    start_date DATETIME NOT NULL,
    end_date DATETIME,
    expected_metrics JSON,
    expected_impact TEXT,
    actual_impact TEXT,
    created_by VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- AI query history and learning
CREATE TABLE ai_queries (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    user_id VARCHAR(36),
    query_text TEXT NOT NULL,
    parsed_intent JSON,
    generated_sql TEXT,
    results_summary JSON,
    context_used JSON,
    feedback_rating INTEGER, -- 1-5 stars
    feedback_notes TEXT,
    execution_time_ms INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- AI insights and pattern detection
CREATE TABLE ai_insights (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    insight_type ENUM('pattern', 'anomaly', 'correlation', 'prediction') NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    confidence_score DECIMAL(3,2), -- 0.00 to 1.00
    supporting_data JSON,
    context_factors JSON,
    status ENUM('active', 'verified', 'dismissed') DEFAULT 'active',
    verified_by VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME,
    FOREIGN KEY (game_id) REFERENCES games(id)
);

-- Context metadata for better AI responses
CREATE TABLE context_metadata (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    metadata_type ENUM('metric_definition', 'business_rule', 'threshold', 'goal') NOT NULL,
    key_name VARCHAR(255) NOT NULL,
    value_data JSON NOT NULL,
    description TEXT,
    created_by VARCHAR(36),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (game_id) REFERENCES games(id),
    UNIQUE KEY unique_game_key (game_id, key_name)
);