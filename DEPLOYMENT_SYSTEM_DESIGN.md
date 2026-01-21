# Remote Config Deployment/Draft System

## Overview
A confirmation and review system for remote config changes to prevent accidental modifications to production configs.

## Database Schema

### ConfigDraft Model
Tracks all config change drafts before deployment:
```
- id: String (Primary Key)
- configId: String (Foreign Key to RemoteConfig)
- gameId: String (Foreign Key to Game)
- key: String
- value: Json
- dataType: String
- environment: String
- enabled: Boolean
- description: String?
- changes: Json (tracks what changed)
- status: String ("draft" | "pending" | "deployed" | "rejected")
- createdBy: String (User ID)
- createdAt: DateTime
- updatedAt: DateTime
- deployedAt: DateTime?
- deployedBy: String? (User ID who deployed)
- rejectionReason: String?
```

Indexes:
- (configId, status)
- (gameId, status)
- (createdAt)

## Backend Implementation

### Services
**`draftService.ts`** - Business logic for draft management:
- `createConfigDraft()` - Create a new draft
- `getPendingDrafts()` - Fetch pending drafts for a game
- `deployDraft()` - Deploy draft to production config
- `rejectDraft()` - Reject a draft with reason
- `updateDraft()` - Update draft (only draft status)
- `deleteDraft()` - Delete draft (only draft/rejected status)
- `getDraftDetails()` - Get draft with history

### Controllers
**`draftController.ts`** - HTTP endpoints:
- `POST /api/admin/drafts` - Save as draft
- `GET /api/admin/drafts` - List pending drafts
- `GET /api/admin/drafts/:draftId` - Get draft details
- `POST /api/admin/drafts/:draftId/deploy` - Deploy draft
- `POST /api/admin/drafts/:draftId/reject` - Reject draft
- `DELETE /api/admin/drafts/:draftId` - Delete draft

### Routes
Added to `/api/admin/drafts/*` paths

## Frontend Implementation (TODO)

### UI Components
1. **Drafts List Panel** - Show pending drafts for current environment
2. **Save as Draft Modal** - Popup on edit form changes
3. **Deployment Confirmation** - Review changes before deploying
4. **Draft History** - Show who created, when, and changes made

### Workflow
1. User edits config → clicks "Save as Draft" instead of "Update Configuration"
2. Changes saved without affecting production config
3. Draft appears in "Pending Drafts" section
4. User can:
   - Review differences
   - Deploy to production
   - Reject with reason
   - Delete if rejected/draft status

### Changes to RemoteConfig.tsx
1. Change "Update Configuration" to "Save as Draft"
2. Add "Pending Drafts" section showing drafts for current environment
3. Add draft review modal showing:
   - Original value
   - New value
   - Changes highlighted
   - Deploy/Reject buttons
4. Add draft history showing deployment status

## Flow Diagram

```
User edits config
        ↓
   "Save as Draft" button
        ↓
Draft created (status: draft)
        ↓
Show in "Pending Drafts"
        ↓
User reviews changes
        ↓
    ┌───┴────┐
    ↓        ↓
Deploy   Reject
    ↓        ↓
Applied   Discarded
 to live   (status: rejected)
```

## API Endpoints

### Save as Draft
```
POST /api/admin/drafts
{
  "configId": "string",
  "gameId": "string",
  "key": "string",
  "value": any,
  "dataType": "string",
  "environment": "string",
  "enabled": boolean,
  "description": "string?",
  "changes": { ... }
}
Response: { success: true, data: { id, configId, status, createdAt, ... } }
```

### List Pending Drafts
```
GET /api/admin/drafts?gameId=xxx&environment=production
Response: { success: true, data: { drafts: [], count: number } }
```

### Deploy Draft
```
POST /api/admin/drafts/:draftId/deploy
Response: { success: true, data: { id, status, deployedAt, deployedBy } }
```

### Reject Draft
```
POST /api/admin/drafts/:draftId/reject
{
  "reason": "string"
}
Response: { success: true, data: { id, status, rejectionReason } }
```

## Status Transitions

```
draft → pending (when ready for review)
      → deployed (approved and applied)
      → rejected (not approved)

pending → deployed
        → rejected

rejected → deleted (user removes)

draft → deleted (user cancels)
```

## Next Steps
1. Implement frontend UI components
2. Add "Pending Drafts" panel to RemoteConfig.tsx
3. Update save/update handlers to use draft endpoints
4. Add draft review and deployment UI
5. Show deployment history and audit trail

