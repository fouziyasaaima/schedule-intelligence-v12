# Prisma fix 12.1.3

Added the missing Organization.connectors inverse relation for Connector.organization so Prisma DMMF generation succeeds. No database volume reset is required.
