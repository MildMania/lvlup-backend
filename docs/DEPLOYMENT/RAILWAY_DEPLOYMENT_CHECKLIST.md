# 🚀 Railway Deployment Checklist

## Pre-Deployment ✅

- [x] Code changes committed
- [x] All TypeScript errors resolved
- [x] Memory optimizations implemented
  - [x] Winston logger optimized
  - [x] Batch writer buffer limits added
  - [x] SessionHeartbeat service optimized
  - [x] Node.js memory limits configured
  - [x] Redis connection improved
  - [x] Metrics endpoint added

## Deployment Steps

### 1. Commit and Push Changes
```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend

git add backend/src/utils/logger.ts
git add backend/src/services/EventBatchWriter.ts
git add backend/src/services/RevenueBatchWriter.ts
git add backend/src/services/SessionHeartbeatBatchWriter.ts
git add backend/src/services/SessionHeartbeatService.ts
git add backend/src/config/redis.ts
git add backend/src/index.ts
git add backend/railway.json
git add RAILWAY_MEMORY_OPTIMIZATION_REPORT.md
git add MEMORY_OPTIMIZATION_IMPLEMENTATION_SUMMARY.md

git commit -m "feat: optimize memory usage for Railway deployment

- Remove Winston file logging in production (saves 50-100MB)
- Add buffer limits to batch writers (prevents memory leaks)
- Optimize SessionHeartbeatService (saves 10-30MB)
- Add Node.js memory limit --max-old-space-size=512
- Improve Redis connection configuration
- Add /api/metrics endpoint for monitoring

Expected: 60-75% memory reduction (5GB → 1.5-2GB)
Expected: 75-80% cost reduction ($30/mo → $7/mo)"

git push origin main
```

### 2. Configure Railway Environment Variables ⚠️ CRITICAL

**Go to Railway Dashboard → Your Service → Variables**

#### A. Update DATABASE_URL (MOST IMPORTANT)

**If you're using Railway's Postgres service** (showing `${{Postgres.DATABASE_URL}}`):

Option 1 - Override with Private URL (Recommended):
```
DATABASE_URL=${{Postgres.DATABASE_PRIVATE_URL}}?connection_limit=10&pool_timeout=20&connect_timeout=10
```

Option 2 - Use Public URL:
```
DATABASE_URL=${{Postgres.DATABASE_URL}}?connection_limit=10&pool_timeout=20&connect_timeout=10
```

**If you're using external Postgres:**
```
DATABASE_URL=postgresql://user:pass@host:port/db?connection_limit=10&pool_timeout=20&connect_timeout=10
```

> ⚠️ **CRITICAL:** This single change saves 200-500MB! Don't skip this.
> 
> **Note:** Railway's `${{Postgres.DATABASE_PRIVATE_URL}}` uses internal networking (faster & more secure).
> The query parameters `?connection_limit=10&pool_timeout=20&connect_timeout=10` will be appended to the resolved URL.

#### B. Add/Update These Variables (Recommended)
```bash
LOG_LEVEL=warn
NODE_ENV=production
```

#### C. Optional Variables
```bash
# If you're using Redis
REDIS_URL=redis://your-redis-host:6379

# If you want to enable data retention cleanup
DATA_RETENTION_ENABLED=false
```

### 3. Monitor Deployment

Watch Railway deployment logs for:

```
✓ Building...
✓ Prisma Client generated
✓ TypeScript compiled
✓ Deploying...
✓ Starting application
✓ LvlUp server running at http://0.0.0.0:3000
✓ Session heartbeat service started
✓ Data retention service started
✓ Level metrics aggregation cron job started
```

### 4. Verify Deployment (First 5 Minutes)

#### Check Health
```bash
curl https://your-backend.railway.app/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2026-02-03T...",
  "uptime": 0.5,
  "environment": "production"
}
```

#### Check Metrics
```bash
curl https://your-backend.railway.app/api/metrics

# Verify:
# - memory.heapUsed < 200MB
# - dbConnections[0].count <= 10
# - batchWriters.*.bufferSize < 100
```

#### Check Railway Dashboard
1. Go to **Metrics** tab
2. Verify memory usage < 512MB
3. Check CPU usage is low

### 5. Monitor First Hour

| Time | Action | Expected |
|------|--------|----------|
| 0-5 min | Basic functionality | All endpoints working |
| 5-15 min | Memory stabilization | Memory drops to ~300MB |
| 15-30 min | Load testing | Memory stays < 512MB |
| 30-60 min | Background services | No memory spikes |

### 6. Monitor First 24 Hours

Track these in Railway Dashboard:

- **Memory Usage:** Should average 300-500MB
- **Memory Peaks:** Should stay < 800MB
- **Database Connections:** Should stay ≤ 10
- **Error Rate:** Should be 0% or very low

## Post-Deployment Verification

### ✅ Success Indicators

- [ ] Memory usage dropped by 60%+ (check Railway metrics)
- [ ] No "out of memory" errors in logs
- [ ] `/api/metrics` endpoint accessible
- [ ] Database connection count ≤ 10
- [ ] Application performance stable
- [ ] All API endpoints working
- [ ] Railway costs projected to decrease

### ⚠️ Warning Signs (Investigate)

- [ ] Memory usage > 1GB
- [ ] "Buffer full" warnings in logs
- [ ] Database connection errors
- [ ] Slow response times
- [ ] Error rate increased

### ❌ Red Flags (Immediate Action Required)

- [ ] Out of memory errors
- [ ] Application crashes
- [ ] Database connection pool exhausted
- [ ] Memory continuously increasing (leak)

## Rollback Plan

If issues occur:

### Quick Rollback
```bash
cd /Users/emre/Desktop/MM-Projects/lvlup-backend
git revert HEAD
git push origin main
```

### Selective Rollback
If only one change is problematic:

1. **Winston logging issue:** Temporarily revert logger.ts
2. **Buffer overflow errors:** Increase MAX_BUFFER_SIZE to 2000
3. **Memory still high:** Increase memory limit to 1024MB
4. **DB connection issues:** Increase connection_limit to 15

## Common Issues & Solutions

### Issue: Memory still > 1GB

**Solutions:**
1. ✅ Verify DATABASE_URL has `connection_limit=10`
2. Check if Redis is using too much memory
3. Review large database queries
4. Increase memory limit to 1024MB

### Issue: "Buffer full" warnings

**Solutions:**
1. Increase MAX_BUFFER_SIZE to 2000
2. Reduce MAX_BATCH_DELAY_MS to 2000
3. Check database write performance

### Issue: Database errors

**Solutions:**
1. Increase connection_limit to 15
2. Check for slow queries
3. Add query timeouts

## Monitoring Tools

### Built-in Monitoring
- **Railway Dashboard:** https://railway.app/dashboard
- **Metrics Endpoint:** https://your-backend.railway.app/api/metrics
- **Health Endpoint:** https://your-backend.railway.app/health

### External Monitoring (Optional)
Consider adding:
- **Better Stack** (formerly Logtail) - Log aggregation
- **Sentry** - Error tracking
- **Datadog** - APM monitoring

## Performance Benchmarks

### Before Optimization
- Memory: 4-5GB average, peaks to 5GB+
- Cost: $20-50/month
- DB Connections: Uncontrolled (50-100+)

### After Optimization (Expected)
- Memory: 300-500MB average, peaks to 800MB
- Cost: $5-10/month (75-80% reduction)
- DB Connections: Max 10

### Success Metrics
- ✅ 60-75% memory reduction
- ✅ 75-80% cost reduction
- ✅ Stable performance
- ✅ No OOM errors

## Next Steps After Successful Deployment

### Week 1
- Monitor memory trends daily
- Check for any "buffer full" warnings
- Verify cost reduction in Railway billing

### Week 2
- Analyze metrics endpoint data
- Fine-tune buffer sizes if needed
- Consider implementing query pagination

### Month 1
- Review all database indexes (remove unused)
- Implement response caching for analytics
- Consider adding compression middleware

## Support & Resources

- **Main Report:** `RAILWAY_MEMORY_OPTIMIZATION_REPORT.md`
- **Implementation Summary:** `MEMORY_OPTIMIZATION_IMPLEMENTATION_SUMMARY.md`
- **Railway Docs:** https://docs.railway.app
- **Prisma Connection Pool:** https://www.prisma.io/docs/concepts/components/prisma-client/connection-management

---

## Quick Reference Commands

```bash
# Check metrics
curl https://your-backend.railway.app/api/metrics

# View Railway logs
railway logs

# SSH into container (if needed)
railway run bash

# Check memory locally
NODE_OPTIONS='--max-old-space-size=512' npm start
```

---

**Ready to deploy?** Follow steps 1-6 above! 🚀

