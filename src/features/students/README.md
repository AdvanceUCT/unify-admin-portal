# Students Feature

This folder contains client-side components for the student management section of the UNIFY Admin Portal.

## Components

### `StudentSearch.tsx`
A client-side search input that allows admins to search for students by first name, last name, full name, or student number. Filtering happens entirely in the browser with no additional network calls after the initial page load.

## How search works

When the students page loads, all 100 student records are fetched from Turso in a single API call and passed to `StudentSearch` as the `initial` prop. From that point, all searching is done by filtering the in-memory array using `useMemo` — every keystroke instantly recalculates the filtered list without touching the database or the server.

The only time the database is called again is when you click through to a student's detail page, which always fetches fresh data to ensure the latest credential status is shown.

This approach means:
- 1 database call on page load
- 0 database calls while searching
- 1 database call per student detail view

## Pages
The student pages live in `src/app/(admin)/students/` and are server components that call `getStudents()` and `getStudentById()` from `src/lib/api/client.ts`.

- `page.tsx` — fetches all students once on the server and passes them to `StudentSearch`. Supports role-based access via `requireRole`.
- `[studentId]/page.tsx` — displays full credential details for a single student including faculty, programme, enrolment status, student number, valid from, expiry date and available actions.

## Data flow

**List page (one call on load):**
page.tsx → client.ts → GET /api/admin/students → store.ts → Turso cloud database

**Search (no network calls):**
keystroke → useMemo filters in-memory array → table re-renders

**Detail page (one call per view):**
[studentId]/page.tsx → client.ts → GET /api/admin/students/[studentId] → store.ts → Turso cloud database

## API routes
- `GET /api/admin/students` — returns all 100 students
- `GET /api/admin/students/[studentId]` — returns a single student record by id
