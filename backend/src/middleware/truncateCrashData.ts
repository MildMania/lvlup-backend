import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Middleware to truncate large fields in crash log payloads to prevent 413 errors
 * while keeping the most important information for debugging
 */

const MAX_STACK_TRACE_LENGTH = 10000; // ~10KB for stack trace
const MAX_BREADCRUMBS_LENGTH = 20000; // ~20KB for breadcrumbs
const MAX_CUSTOM_DATA_LENGTH = 5000; // ~5KB for custom data
const MAX_MESSAGE_LENGTH = 2000; // ~2KB for error message

export const truncateCrashData = (req: Request, res: Response, next: NextFunction) => {
  try {
    const crashData = req.body;
    let wasTruncated = false;
    const truncationInfo: string[] = [];

    // Truncate stack trace - keep the most relevant parts (top and bottom)
    const stackTraceField = crashData.StackTrace || crashData.stackTrace;
    if (stackTraceField && stackTraceField.length > MAX_STACK_TRACE_LENGTH) {
      const topPart = stackTraceField.substring(0, MAX_STACK_TRACE_LENGTH / 2);
      const bottomPart = stackTraceField.substring(
        stackTraceField.length - MAX_STACK_TRACE_LENGTH / 2
      );
      
      const truncatedStack = 
        topPart + 
        `\n\n... [TRUNCATED ${stackTraceField.length - MAX_STACK_TRACE_LENGTH} characters] ...\n\n` + 
        bottomPart;
      
      if (crashData.StackTrace) crashData.StackTrace = truncatedStack;
      if (crashData.stackTrace) crashData.stackTrace = truncatedStack;
      
      wasTruncated = true;
      truncationInfo.push(`stackTrace: ${stackTraceField.length} → ${truncatedStack.length} bytes`);
    }

    // Truncate breadcrumbs - keep the most recent ones
    const breadcrumbsField = crashData.Breadcrumbs || crashData.breadcrumbs;
    if (breadcrumbsField) {
      const breadcrumbsStr = typeof breadcrumbsField === 'string' 
        ? breadcrumbsField 
        : JSON.stringify(breadcrumbsField);
      
      if (breadcrumbsStr.length > MAX_BREADCRUMBS_LENGTH) {
        try {
          const breadcrumbsArray = typeof breadcrumbsField === 'string' 
            ? JSON.parse(breadcrumbsField) 
            : breadcrumbsField;
          
          if (Array.isArray(breadcrumbsArray)) {
            // Keep the most recent breadcrumbs that fit within the limit
            let truncatedBreadcrumbs = [];
            let currentSize = 0;
            
            for (let i = breadcrumbsArray.length - 1; i >= 0; i--) {
              const itemSize = JSON.stringify(breadcrumbsArray[i]).length;
              if (currentSize + itemSize > MAX_BREADCRUMBS_LENGTH) break;
              truncatedBreadcrumbs.unshift(breadcrumbsArray[i]);
              currentSize += itemSize;
            }
            
            const truncatedStr = JSON.stringify(truncatedBreadcrumbs);
            if (crashData.Breadcrumbs) crashData.Breadcrumbs = truncatedStr;
            if (crashData.breadcrumbs) crashData.breadcrumbs = truncatedStr;
            
            wasTruncated = true;
            truncationInfo.push(
              `breadcrumbs: ${breadcrumbsArray.length} items (${breadcrumbsStr.length} bytes) → ` +
              `${truncatedBreadcrumbs.length} items (${truncatedStr.length} bytes)`
            );
          }
        } catch (e) {
          // If parsing fails, just truncate the string
          const truncated = breadcrumbsStr.substring(0, MAX_BREADCRUMBS_LENGTH) + 
            '... [TRUNCATED]';
          if (crashData.Breadcrumbs) crashData.Breadcrumbs = truncated;
          if (crashData.breadcrumbs) crashData.breadcrumbs = truncated;
          
          wasTruncated = true;
          truncationInfo.push(`breadcrumbs: ${breadcrumbsStr.length} → ${truncated.length} bytes (raw string)`);
        }
      }
    }

    // Truncate custom data
    if (crashData.customData) {
      const customDataStr = typeof crashData.customData === 'string' 
        ? crashData.customData 
        : JSON.stringify(crashData.customData);
      
      if (customDataStr.length > MAX_CUSTOM_DATA_LENGTH) {
        const truncated = customDataStr.substring(0, MAX_CUSTOM_DATA_LENGTH) + 
          '... [TRUNCATED]';
        crashData.customData = truncated;
        
        wasTruncated = true;
        truncationInfo.push(`customData: ${customDataStr.length} → ${truncated.length} bytes`);
      }
    }

    // Truncate error message if extremely long
    const messageField = crashData.Message || crashData.message;
    if (messageField && messageField.length > MAX_MESSAGE_LENGTH) {
      const truncated = messageField.substring(0, MAX_MESSAGE_LENGTH) + '... [TRUNCATED]';
      if (crashData.Message) crashData.Message = truncated;
      if (crashData.message) crashData.message = truncated;
      
      wasTruncated = true;
      truncationInfo.push(`message: ${messageField.length} → ${truncated.length} bytes`);
    }

    // Log truncation for monitoring
    if (wasTruncated) {
      logger.info(`Crash data truncated: ${truncationInfo.join(', ')}`);
      
      // Add metadata to indicate truncation occurred
      crashData._truncated = true;
      crashData._truncationInfo = truncationInfo;
    }

    next();
  } catch (error) {
    logger.error('Error in truncateCrashData middleware:', error);
    // Continue anyway, don't block the request
    next();
  }
};

