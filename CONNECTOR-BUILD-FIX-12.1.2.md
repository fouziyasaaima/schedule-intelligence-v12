# Connector Build Fix — v12.1.2

Fixed the New Connection UI compile error where the Target SI project selector referenced an undeclared `projects` variable. The form now loads available Schedule Intelligence projects through `api.listProjects` and treats the target project as optional.
