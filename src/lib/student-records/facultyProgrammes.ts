/**
 * @fileoverview Defines faculty and programme reference values used by student forms.
 * @module lib/student-records/facultyProgrammes
 */

export const SIMULATED_FACULTY_PROGRAMMES: Record<string, string[]> = {
  Commerce: [
    "Bachelor of Commerce",
    "Bachelor of Business Science",
    "Bachelor of Accounting",
    "Postgraduate Diploma in Accounting",
    "Master of Commerce in Finance",
  ],
  Science: [
    "Bachelor of Science",
    "BSc Honours in Computer Science",
    "Bachelor of Science in Data Science",
    "Master of Science in Bioinformatics",
    "Doctor of Philosophy in Physics",
  ],
  Engineering: [
    "BSc Engineering (Electrical)",
    "BSc Engineering (Mechanical)",
    "BSc Engineering (Civil)",
    "BSc Engineering (Chemical)",
    "Master of Science in Engineering",
  ],
  "Health Sciences": [
    "MBChB",
    "Bachelor of Pharmacy",
    "Bachelor of Physiotherapy",
    "Bachelor of Nursing",
    "Master of Science in Medicine",
  ],
  Law: [
    "Bachelor of Laws (LLB)",
    "Bachelor of Arts and Law",
    "Master of Laws (LLM)",
    "Doctor of Laws (LLD)",
  ],
  Humanities: [
    "Bachelor of Arts",
    "Bachelor of Social Science",
    "BA in Film & Media Production",
    "Master of Arts in African Studies",
    "Bachelor of Education",
  ],
};
