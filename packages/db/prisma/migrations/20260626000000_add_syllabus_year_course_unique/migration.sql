-- CreateIndex
-- WHY: シラバス同期は (academic_year, course_name) を自然キーに upsert する。
-- read-then-write の競合で重複行が生まれないよう一意制約を backstop にする。
CREATE UNIQUE INDEX "syllabi_academic_year_course_name_key" ON "syllabi"("academic_year", "course_name");
