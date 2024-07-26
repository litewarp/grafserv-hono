-- id: 1, nodeId: WyJQYXJlbnQiLDFd
insert into a.parent (parent_name) values ('mom');

-- id: 2, nodeId: WyJQYXJlbnQiLDJd
insert into a.parent (parent_name) values ('dad');

-- id: 1, nodeId: WyJDaGlsZCIsMV0=
insert into
    a.child (
        mom_parent_id, dad_parent_id, name
    )
values (1, 2, 'child 1');

-- id: 2, nodeId: WyJDaGlsZCIsMl0==
insert into a.child (name) values ('child 2');