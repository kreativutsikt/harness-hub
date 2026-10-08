CREATE TABLE IF NOT EXISTS docs (
  coll TEXT NOT NULL,
  id   TEXT NOT NULL,
  data TEXT NOT NULL,
  ts   INTEGER NOT NULL,
  PRIMARY KEY (coll, id)
);

INSERT OR IGNORE INTO docs (coll, id, data, ts) VALUES
('ideas','seed-dashboards','{"text":"Custom dashboards: one live view that pulls our own numbers together, built with AI instead of off-the-shelf tools.","name":"Ian","uid":"seed","ts":1791450000000}',1791450000000),
('ideas','seed-physical','{"text":"Physical systems with AI: a harvest log for grow containers (phone form or QR code per container, data into a database, dashboard on top). What else could be logged this way?","name":"Ian","uid":"seed","ts":1791450001000}',1791450001000);
