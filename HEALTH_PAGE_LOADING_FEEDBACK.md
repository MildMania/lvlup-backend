# Health Page Loading Feedback Implementation

## Summary
Added loading/processing feedback when a Top Error is clicked in the Health page to improve user experience during data fetching.

## Changes Made

### 1. Frontend Component Updates (`/frontend/src/components/Health.tsx`)

#### Added State Management
- Added `clickedErrorId` state to track which error row is currently being loaded
- This allows us to show loading feedback on the specific row that was clicked

#### Updated Click Handler
```typescript
const handleTopErrorClick = (error: HealthMetrics['topCrashes'][0]) => {
  setClickedErrorId(error.id);  // Mark this row as loading
  fetchErrorInstances(error.message, error.exceptionType);
};
```

#### Enhanced Data Fetching
```typescript
const fetchErrorInstances = async (message: string, exceptionType: string) => {
  setLoadingInstances(true);
  try {
    // ... fetch logic ...
  } finally {
    setLoadingInstances(false);
    setClickedErrorId(null);  // Clear loading state after completion
  }
};
```

#### Visual Feedback in Table
- Added conditional rendering to show loading spinner and text in the clicked row
- Applied `loading-row` CSS class for visual styling
- Disabled pointer events during loading to prevent multiple clicks

```tsx
<tr 
  className={`clickable-row ${clickedErrorId === crash.id ? 'loading-row' : ''}`}
>
  <td className="crash-message">
    {clickedErrorId === crash.id ? (
      <span className="loading-text">
        <span className="spinner"></span>
        Loading instances...
      </span>
    ) : (
      crash.message
    )}
  </td>
</tr>
```

### 2. CSS Styling Updates (`/frontend/src/components/Health.css`)

#### Loading Row Styling
```css
.loading-row {
  background-color: var(--bg-tertiary) !important;
  opacity: 0.7;
  pointer-events: none;  /* Prevent clicks while loading */
}
```

#### Loading Text with Spinner
```css
.loading-text {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: var(--accent-primary);
  font-weight: 500;
}

.spinner {
  width: 14px;
  height: 14px;
  border: 2px solid var(--border-primary);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

## User Experience Improvements

### Before
- ❌ No visual feedback when clicking a Top Error row
- ❌ User unsure if click registered
- ❌ Possible multiple clicks during loading
- ❌ Uncertain wait time

### After
- ✅ Immediate visual feedback on row click
- ✅ Animated spinner indicates processing
- ✅ "Loading instances..." text confirms action
- ✅ Row styling changes (background color, opacity)
- ✅ Prevents multiple clicks (pointer-events disabled)
- ✅ Loading state clears automatically when data loads

## Technical Details

- **Loading State Duration**: Typically 0.5-2 seconds depending on data size
- **Visual Indicators**: 
  - Spinner animation (14px, rotating)
  - Text message ("Loading instances...")
  - Background color change
  - Reduced opacity (0.7)
- **Click Protection**: `pointer-events: none` prevents double-clicks
- **State Cleanup**: Automatic clearing of loading state in `finally` block

## Testing Recommendations

1. Click a Top Error row and verify:
   - Spinner appears immediately
   - Row background changes
   - "Loading instances..." text shows
   - Row cannot be clicked again while loading
   
2. Wait for modal to open and verify:
   - Loading indicators disappear
   - Error instances modal displays
   - Row returns to normal state

3. Test error scenarios:
   - Network failure should clear loading state
   - Multiple rapid clicks should only trigger once

## Files Modified

1. `/frontend/src/components/Health.tsx` - Component logic and UI
2. `/frontend/src/components/Health.css` - Loading state styling

## Performance Impact

- Negligible: Only adds CSS class toggling and state updates
- No additional API calls
- Spinner animation is CSS-based (hardware accelerated)

## Deployment Notes

- No backend changes required
- No database migrations needed
- Pure frontend enhancement
- Safe to deploy without coordination

