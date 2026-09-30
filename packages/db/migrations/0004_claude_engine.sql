-- T-78: Claude adapter — add 'claude' as a fourth engine
ALTER TYPE "public"."engine" ADD VALUE IF NOT EXISTS 'claude';
