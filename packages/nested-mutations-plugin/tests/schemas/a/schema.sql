-- forward nested mutation creates records

drop schema if exists a cascade;

create schema a;

create table a.parent (
    id serial primary key, parent_name text not null
);

create table a.child (
    id serial primary key, mom_parent_id integer, dad_parent_id integer, name text not null, constraint child_mom_parent_fkey foreign key (mom_parent_id) references a.parent (id), constraint child_dad_parent_fkey foreign key (dad_parent_id) references a.parent (id)
);

create index on a.child (mom_parent_id);

create index on a.child (dad_parent_id);