/*
  Warnings:

  - Added the required column `name` to the `AdminInvite` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "AdminInvite" ADD COLUMN     "name" TEXT NOT NULL;
