-- PRMS dependency invariant: one relationship per predecessor -> successor pair.
DELETE FROM "dependencies" d
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "project_id", "predecessor_task_id", "successor_task_id"
           ORDER BY "created_at" ASC, id ASC
         ) AS rn
  FROM "dependencies"
) ranked
WHERE d.id = ranked.id AND ranked.rn > 1;

CREATE UNIQUE INDEX "dependencies_project_predecessor_successor_key"
ON "dependencies"("project_id", "predecessor_task_id", "successor_task_id");
