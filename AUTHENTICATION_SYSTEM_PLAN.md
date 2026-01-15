# Authentication & Authorization System Implementation Plan

## Overview
Implementing a comprehensive dashboard user authentication and authorization system for the LvlUp analytics platform. This system will enable team collaboration with role-based access control while maintaining the existing API key authentication for game-to-backend communication.

## System Architecture

### User Types
1. **Dashboard Users** (NEW) - Developers, analysts, and admins who access analytics dashboards
2. **Game Users** (EXISTING) - Players tracked via SDK events (no authentication required)

## Feature Breakdown

### 1. User Authentication
- [x] Email/Password Registration
- [x] Email Verification
- [x] Login with JWT tokens
- [x] Password Reset via email
- [x] Refresh Token rotation
- [x] Session management
- [x] Account activation/deactivation

### 2. Two-Factor Authentication (2FA)
- [x] TOTP-based 2FA (Google Authenticator, Authy)
- [x] QR code generation for setup
- [x] Backup codes (10 single-use codes)
- [x] 2FA recovery flow
- [x] Optional for Viewer/Editor, Recommended for Owner/Admin

### 3. Role-Based Access Control (RBAC)

#### Role Hierarchy
1. **Super Admin** - Platform administrators
   - Manage all teams, users, and games
   - System configuration
   - User impersonation for support

2. **Admin** - Team/Organization administrators
   - Create and manage teams
   - Invite users to teams
   - Assign roles to team members
   - Grant access to games (all or specific)

3. **Game Owner** - Game-level full control
   - Full CRUD access to assigned games
   - View and analyze all game data
   - Manage game settings and configurations
   - Cannot invite users (team-level permission)

4. **Editor** - Can modify game data
   - Edit game configurations
   - Manage A/B tests and remote configs
   - View analytics
   - Cannot delete games

5. **Viewer** - Read-only access
   - View analytics dashboards
   - Export reports
   - No modification permissions

### 4. Team Management
- [x] Create teams (by Admins)
- [x] Team profiles (name, description, settings)
- [x] Team member management
- [x] Role assignment within teams
- [x] Team activity logs
- [x] Team deletion and transfer

### 5. Game Access Management
- [x] Grant access to specific games
- [x] Grant access to all games (wildcard)
- [x] Access level per game (Owner/Editor/Viewer)
- [x] Access inheritance from team
- [x] Individual access overrides
- [x] Access revocation

### 6. User Creation by Admins (SIMPLIFIED)
- [x] Admins can create user accounts directly
- [x] Set initial password (user can change on first login)
- [x] Assign to team with role during creation
- [x] Grant game access during creation
- [x] Send welcome email with credentials (optional)

### 7. Security Features
- [x] Password hashing (bcrypt, 12 rounds)
- [x] JWT with short expiration (15 min access, 7 days refresh)
- [x] HttpOnly cookies for tokens
- [x] CSRF protection
- [x] Rate limiting on auth endpoints
- [x] Account lockout after failed attempts
- [x] Password complexity requirements
- [x] Audit logs for sensitive actions
- [x] IP-based anomaly detection (optional)

## Database Schema Design

### New Models

```prisma
// Dashboard user account (not game player)
model DashboardUser {
  id                String            @id @default(cuid())
  email             String            @unique
  passwordHash      String
  firstName         String
  lastName          String
  
  // Account status
  isEmailVerified   Boolean           @default(false)
  emailVerificationToken String?      @unique
  emailVerificationExpires DateTime?
  
  isActive          Boolean           @default(true)
  isLocked          Boolean           @default(false)
  lockReason        String?
  
  // Password reset
  passwordResetToken String?         @unique
  passwordResetExpires DateTime?
  
  // Failed login tracking
  failedLoginAttempts Int            @default(0)
  lastFailedLogin   DateTime?
  
  // Metadata
  lastLogin         DateTime?
  lastLoginIp       String?
  createdAt         DateTime          @default(now())
  updatedAt         DateTime          @updatedAt
  
  // Relations
  teamMemberships   TeamMember[]
  gameAccesses      GameAccess[]
  refreshTokens     RefreshToken[]
  twoFactorAuth     TwoFactorAuth?
  auditLogs         AuditLog[]
  createdBy         String?           // DashboardUser ID who created this account
  
  @@map("dashboard_users")
}

// Teams for organizing users and game access
model Team {
  id          String         @id @default(cuid())
  name        String
  description String?
  slug        String         @unique
  
  isActive    Boolean        @default(true)
  
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt
  
  // Relations
  members     TeamMember[]
  gameAccesses GameAccess[]
  
  @@map("teams")
}

// Team membership with roles
model TeamMember {
  id        String       @id @default(cuid())
  teamId    String
  userId    String
  role      DashboardRole
  
  joinedAt  DateTime     @default(now())
  updatedAt DateTime     @updatedAt
  
  team      Team         @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      DashboardUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@unique([teamId, userId])
  @@map("team_members")
}

// Game access for teams or individual users
model GameAccess {
  id        String         @id @default(cuid())
  
  // Access can be team-based or user-based
  teamId    String?
  userId    String?
  
  // Access can be for specific game or all games
  gameId    String?
  allGames  Boolean        @default(false)
  
  // Access level
  accessLevel AccessLevel
  
  // Grant info
  grantedAt DateTime       @default(now())
  grantedBy String?        // DashboardUser ID
  expiresAt DateTime?
  
  team      Team?          @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user      DashboardUser? @relation(fields: [userId], references: [id], onDelete: Cascade)
  game      Game?          @relation(fields: [gameId], references: [id], onDelete: Cascade)
  
  @@unique([teamId, gameId])
  @@unique([userId, gameId])
  @@map("game_accesses")
}


// JWT refresh tokens
model RefreshToken {
  id        String        @id @default(cuid())
  userId    String
  token     String        @unique
  
  expiresAt DateTime
  createdAt DateTime      @default(now())
  
  // Device/session tracking
  userAgent String?
  ipAddress String?
  
  user      DashboardUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@index([userId, expiresAt])
  @@map("refresh_tokens")
}

// Two-factor authentication
model TwoFactorAuth {
  id            String        @id @default(cuid())
  userId        String        @unique
  
  isEnabled     Boolean       @default(false)
  secret        String        // Encrypted TOTP secret
  backupCodes   Json          // Array of hashed backup codes
  
  createdAt     DateTime      @default(now())
  lastUsedAt    DateTime?
  
  user          DashboardUser @relation(fields: [userId], references: [id], onDelete: Cascade)
  
  @@map("two_factor_auth")
}

// Audit logs for security and compliance
model AuditLog {
  id          String        @id @default(cuid())
  userId      String?
  action      String        // e.g., "USER_LOGIN", "GAME_CREATED", "ROLE_CHANGED"
  resource    String?       // e.g., "Game:abc123", "Team:xyz789"
  details     Json?
  
  ipAddress   String?
  userAgent   String?
  
  createdAt   DateTime      @default(now())
  
  user        DashboardUser? @relation(fields: [userId], references: [id])
  
  @@index([userId, createdAt])
  @@index([action, createdAt])
  @@map("audit_logs")
}

// Enums
enum DashboardRole {
  SUPER_ADMIN
  ADMIN
  GAME_OWNER
  EDITOR
  VIEWER
}

enum AccessLevel {
  OWNER    // Full control
  EDITOR   // Can modify
  VIEWER   // Read-only
}
```

### Schema Modifications

Add to existing `Game` model:
```prisma
model Game {
  // ...existing fields...
  gameAccesses GameAccess[]
}
```

## API Endpoints Specification

### Authentication Endpoints

```
POST   /api/auth/register                  # Self-registration (optional, can be disabled)
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh                   # Refresh access token
POST   /api/auth/verify-email/:token
POST   /api/auth/resend-verification
POST   /api/auth/forgot-password
POST   /api/auth/reset-password/:token
GET    /api/auth/me                        # Get current user
PUT    /api/auth/me                        # Update profile
PUT    /api/auth/change-password
```

### Two-Factor Authentication

```
POST   /api/auth/2fa/setup                 # Generate QR code and secret
POST   /api/auth/2fa/verify-setup          # Verify and enable 2FA
POST   /api/auth/2fa/verify                # Verify 2FA code during login
POST   /api/auth/2fa/disable
POST   /api/auth/2fa/backup-codes          # Generate new backup codes
```

### Team Management

```
GET    /api/teams                          # List user's teams
POST   /api/teams                          # Create team (Admin)
GET    /api/teams/:id
PUT    /api/teams/:id
DELETE /api/teams/:id

GET    /api/teams/:id/members
POST   /api/teams/:id/members              # Add member
PUT    /api/teams/:id/members/:userId      # Update member role
DELETE /api/teams/:id/members/:userId      # Remove member
```

### User Management (Admin only)

```
GET    /api/users                          # List all dashboard users
POST   /api/users                          # Create new user (Admin)
GET    /api/users/:id
PUT    /api/users/:id                      # Update user
DELETE /api/users/:id                      # Deactivate user
POST   /api/users/:id/unlock               # Unlock locked account
POST   /api/users/:id/reset-password       # Admin reset user password
```

### Game Access Management

```
GET    /api/games/:id/access               # List users/teams with access
POST   /api/games/:id/access               # Grant access
PUT    /api/games/:id/access/:accessId     # Update access level
DELETE /api/games/:id/access/:accessId     # Revoke access

GET    /api/users/:id/games                # List games user can access
```

```
GET    /api/games/:id/access               # List users/teams with access
POST   /api/games/:id/access               # Grant access
PUT    /api/games/:id/access/:accessId     # Update access level
DELETE /api/games/:id/access/:accessId     # Revoke access

GET    /api/users/:id/games                # List games user can access
```

### User Management (Admin only)

```
GET    /api/users                          # List all dashboard users
GET    /api/users/:id
PUT    /api/users/:id                      # Update user
DELETE /api/users/:id                      # Deactivate user
POST   /api/users/:id/unlock               # Unlock locked account
```

### Audit Logs

```
GET    /api/audit-logs                     # List audit logs (Admin)
GET    /api/audit-logs/me                  # User's own audit trail
```

## Implementation Task List

### Phase 1: Foundation (Priority: HIGH)
- [ ] 1.1 Update Prisma schema with new models
- [ ] 1.2 Run database migration
- [ ] 1.3 Install required packages (bcrypt, jsonwebtoken, speakeasy, qrcode, zxcvbn)
- [ ] 1.4 Create environment variables for JWT secrets, email service
- [ ] 1.5 Setup email service integration (Resend or SendGrid)

### Phase 2: Core Authentication (Priority: HIGH)
- [ ] 2.1 Create TokenService (JWT generation, verification, refresh)
- [ ] 2.2 Create AuthService (register, login, password management)
- [ ] 2.3 Create dashboardAuth middleware (JWT validation)
- [ ] 2.4 Create roleCheck middleware
- [ ] 2.5 Create gameAccessCheck middleware
- [ ] 2.6 Implement AuthController with basic endpoints
- [ ] 2.7 Create auth routes
- [ ] 2.8 Add rate limiting to auth endpoints

### Phase 3: Email & Verification (Priority: HIGH)
- [ ] 3.1 Create EmailService with templates
- [ ] 3.2 Implement email verification flow
- [ ] 3.3 Implement password reset flow
- [ ] 3.4 Add email verification checks to login

### Phase 4: Team & Access Management (Priority: HIGH)
- [ ] 4.1 Create TeamService
- [ ] 4.2 Create GameAccessService
- [ ] 4.3 Implement TeamController
- [ ] 4.4 Create team routes
- [ ] 4.5 Create game access routes
- [ ] 4.6 Add access control checks to existing game endpoints

### Phase 5: User Management by Admins (Priority: HIGH)
- [ ] 5.1 Create UserManagementService
- [ ] 5.2 Implement UserManagementController
- [ ] 5.3 Create user management routes
- [ ] 5.4 Add user creation with team assignment
- [ ] 5.5 Add game access assignment during user creation
- [ ] 5.6 Implement password reset by admin

### Phase 6: Two-Factor Authentication (Priority: MEDIUM)
- [ ] 6.1 Create TwoFactorAuthService
- [ ] 6.2 Implement 2FA setup endpoint
- [ ] 6.3 Implement 2FA verification in login flow
- [ ] 6.4 Generate and manage backup codes
- [ ] 6.5 Create 2FA recovery flow
- [ ] 6.6 Add 2FA status to user profile

### Phase 7: Audit & Security (Priority: MEDIUM)
- [ ] 7.1 Create AuditLogService
- [ ] 7.2 Add audit logging to sensitive operations
- [ ] 7.3 Implement account lockout mechanism
- [ ] 7.4 Add password complexity validation
- [ ] 7.5 Create audit log endpoints
- [ ] 7.6 Add CSRF protection

### Phase 8: Frontend Implementation (Priority: HIGH)
- [ ] 8.1 Create AuthContext with login state management
- [ ] 8.2 Create Login component
- [ ] 8.3 Create Register component
- [ ] 8.4 Create EmailVerification component
- [ ] 8.5 Create PasswordReset component
- [ ] 8.6 Create ProtectedRoute wrapper
- [ ] 8.7 Add axios interceptors for token refresh
- [ ] 8.8 Create TeamManagement dashboard
- [ ] 8.9 Create UserProfile component
- [ ] 8.10 Create InvitationAcceptance page

### Phase 9: Advanced Frontend (Priority: MEDIUM)
- [ ] 9.1 Create TwoFactorSetup component
- [ ] 9.2 Create TwoFactorVerification component
- [ ] 9.3 Create GameAccessManagement component
- [ ] 9.4 Create InvitationManagement component
- [ ] 9.5 Create AuditLog viewer (Admin)
- [ ] 9.6 Add role-based UI elements

### Phase 10: Testing & Documentation (Priority: HIGH)
- [ ] 10.1 Write unit tests for AuthService
- [ ] 10.2 Write unit tests for TokenService
- [ ] 10.3 Write integration tests for auth endpoints
- [ ] 10.4 Write tests for RBAC middleware
- [ ] 10.5 Write API documentation
- [ ] 10.6 Create user guides for admin features
- [ ] 10.7 Security audit checklist

### Phase 11: Migration & Deployment (Priority: HIGH)
- [ ] 11.1 Create migration script for existing data
- [ ] 11.2 Create default Super Admin account
- [ ] 11.3 Update deployment scripts
- [ ] 11.4 Setup email service in production
- [ ] 11.5 Configure environment variables
- [ ] 11.6 Database backup before migration

## Security Considerations

### 1. Password Security
- bcrypt with 12 rounds for hashing
- Minimum 8 characters, require uppercase, lowercase, number, special char
- Check against common password lists using zxcvbn
- Password reset tokens expire in 1 hour
- Force password change on first login from invitation

### 2. Token Security
- Access tokens: 15 minutes expiration
- Refresh tokens: 7 days expiration
- Store tokens in httpOnly cookies (CSRF protected)
- Rotate refresh tokens on use
- Revoke all tokens on password change

### 3. Rate Limiting
- Login: 5 attempts per 15 minutes per IP
- Registration: 3 attempts per hour per IP
- Password reset: 3 attempts per hour per email
- 2FA verification: 5 attempts per 15 minutes per user

### 4. Account Security
- Lock account after 5 failed login attempts
- Email notification on suspicious activity
- IP-based anomaly detection (optional)
- Mandatory 2FA for Admin and Game Owner roles

### 5. Data Protection
- Encrypt sensitive data at rest (2FA secrets)
- HTTPS only in production
- Secure headers (helmet middleware)
- CORS configuration for frontend domain only
- Input validation and sanitization

### 6. Audit & Compliance
- Log all authentication events
- Log all permission changes
- Log all data access by dashboard users
- Retain audit logs for 90 days minimum
- GDPR compliance for user data deletion

## Testing Strategy

### Unit Tests
- AuthService methods (register, login, password operations)
- TokenService (generation, verification, refresh)
- InvitationService (create, validate, expire)
- TwoFactorAuthService (setup, verify, backup codes)
- Middleware functions (auth, role check, game access)

### Integration Tests
- Complete registration flow
- Login with 2FA flow
- Password reset flow
- Invitation acceptance flow
- Token refresh flow
- Access control scenarios

### E2E Tests
- User registration and login
- Team creation and member management
- Game access granting and verification
- Invitation sending and acceptance
- 2FA setup and login

### Security Tests
- SQL injection attempts
- XSS attempts
- CSRF token validation
- Rate limiting effectiveness
- Token manipulation attempts
- Role escalation attempts

## Dependencies to Install

### Backend
```bash
npm install bcrypt jsonwebtoken speakeasy qrcode zxcvbn
npm install express-rate-limit cookie-parser
npm install resend # or @sendgrid/mail
npm install --save-dev @types/bcrypt @types/jsonwebtoken @types/speakeasy @types/qrcode @types/cookie-parser
```

### Frontend
```bash
npm install react-router-dom @tanstack/react-query
npm install qrcode.react
npm install zxcvbn
```

## Configuration

### Environment Variables
```env
# JWT Configuration
JWT_ACCESS_SECRET=<random-256-bit-key>
JWT_REFRESH_SECRET=<random-256-bit-key>
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Email Service (Resend example)
EMAIL_SERVICE=resend
RESEND_API_KEY=<your-resend-api-key>
EMAIL_FROM=noreply@yourdomain.com

# App URLs
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:3000

# Security
BCRYPT_ROUNDS=12
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=5

# 2FA
TWO_FACTOR_ISSUER=LvlUp Analytics
```

## Migration Strategy

### For Existing Games
1. Create a default "System" team
2. Create initial Super Admin account
3. Assign all existing games to System team with OWNER access
4. Send invitation to additional admins
5. Gradually migrate to team-based structure

### Zero-Downtime Deployment
1. Deploy new schema without enforcing auth
2. Create admin accounts
3. Assign game accesses
4. Enable auth enforcement gradually by endpoint
5. Monitor for access issues
6. Complete rollout

## Success Metrics
- Zero unauthorized access incidents
- < 3 seconds average login time
- > 95% email delivery rate
- > 80% 2FA adoption for Admins
- < 1% false positive rate for anomaly detection
- 100% audit coverage for sensitive operations

---

**Last Updated:** January 15, 2026
**Status:** Planning Complete - Ready for Implementation

