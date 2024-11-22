-- forward nested mutation creates records
DROP SCHEMA if EXISTS a cascade;

CREATE SCHEMA a;

CREATE TABLE a.parent (id serial PRIMARY KEY, parent_name TEXT NOT NULL);

CREATE TABLE a.child (
  id serial PRIMARY KEY,
  mom_parent_id INTEGER,
  dad_parent_id INTEGER,
  name TEXT NOT NULL,
  CONSTRAINT child_mom_parent_fkey FOREIGN key (mom_parent_id) REFERENCES a.parent (id),
  CONSTRAINT child_dad_parent_fkey FOREIGN key (dad_parent_id) REFERENCES a.parent (id)
);

CREATE TABLE a.schools (id serial PRIMARY KEY, name TEXT NOT NULL);

CREATE TABLE a.school_student (
  id serial PRIMARY KEY,
  school_id INTEGER,
  student_id INTEGER,
  CONSTRAINT school_student_school_id_fkey FOREIGN key (school_id) REFERENCES a.schools (id),
  CONSTRAINT school_student_student_id_fkey FOREIGN key (student_id) REFERENCES a.child (id)
);

CREATE INDEX ON a.school_student (school_id);

CREATE INDEX ON a.school_student (student_id);

CREATE INDEX ON a.child (mom_parent_id);

CREATE INDEX ON a.child (dad_parent_id);