-- CreateTable
CREATE TABLE "attendance_qr_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "room_id" TEXT NOT NULL,
    "timetable_id" TEXT,
    "class_date" DATE NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_qr_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "attendance_qr_sessions_user_id_expires_at_idx" ON "attendance_qr_sessions"("user_id", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_qr_sessions_user_id_room_id_class_date_key" ON "attendance_qr_sessions"("user_id", "room_id", "class_date");

-- AddForeignKey
ALTER TABLE "attendance_qr_sessions" ADD CONSTRAINT "attendance_qr_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_qr_sessions" ADD CONSTRAINT "attendance_qr_sessions_timetable_id_fkey" FOREIGN KEY ("timetable_id") REFERENCES "timetables"("id") ON DELETE SET NULL ON UPDATE CASCADE;
