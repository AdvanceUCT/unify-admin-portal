# Students Feature

This folder contains client-side components for the student management section of the UNIFY Admin Portal.

## Components

### `StudentSearch.tsx`
A client-side search input that allows admins to search for students by first name, last name, full name, or student number. Updates the URL query string on every keystroke which triggers a server-side re-fetch of filtered results. Includes a magnifying glass icon and a "Searching..." indicator while results are loading.

## Pages
The student pages live in `src/app/(admin)/students/` and are server components that call `getStudents()` and `getStudentById()` from `src/lib/api/client.ts`.

- `page.tsx` — displays all 100 students in a table with name, faculty, programme, enrolment status and credential state. Supports search via the `?query=` URL param.
- `[studentId]/page.tsx` — displays full credential details for a single student including faculty, programme, enrolment status, student number, valid from, expiry date and available actions.

## Data flow
page.tsx → client.ts → GET /api/admin/students → store.ts → Turso cloud database

## API routes
- `GET /api/admin/students` — returns all students or filtered results when `?query=` is provided
- `GET /api/admin/students/[studentId]` — returns a single student record by id