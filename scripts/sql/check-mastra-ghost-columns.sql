-- Mastra / Prisma conflict monitor (Postiz issue #1473).
-- If mastra_ai_spans.dropped is hundreds+, drop that table or fix deploy
-- (stop running prisma db push on every restart).
SELECT c.relname,
       count(*) FILTER (WHERE attisdropped) AS dropped,
       count(*) FILTER (WHERE NOT attisdropped AND attnum > 0) AS active
FROM pg_attribute a
JOIN pg_class c ON c.oid = a.attrelid
WHERE c.relname LIKE 'mastra_%'
GROUP BY c.relname
HAVING count(*) FILTER (WHERE attisdropped) > 0
ORDER BY dropped DESC;
