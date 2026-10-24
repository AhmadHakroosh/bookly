# Routing matrix

Who to involve, by kind of work. **L** = leads, **C** = consulted, **R** = reviews before ship.

| Work                                 | product | ux  | design | architect | builder | tester | devops | security | ai  | business | sales | lic. | privacy | brand | growth |
| ------------------------------------ | ------- | --- | ------ | --------- | ------- | ------ | ------ | -------- | --- | -------- | ----- | ---- | ------- | ----- | ------ |
| New feature (client work)            | L       | C   | C      | C         | L       | R      | C      | R        |     |          | C     |      |         | C     | C      |
| New feature (hiring)                 | L       | L   | C      | C         | L       | R      | C      | R        | C   |          | C     | C    | R       | C     | C      |
| Anything using AI on people          | C       | C   |        | C         | C       | R      |        | R        | L   |          |       |      | R       |       |        |
| Schema / data model change           | C       |     |        | L         | L       | R      | R      | R        |     |          |       |      | C       |       |        |
| Rebrand / visual change              |         | C   | L      |           | C       | R      |        |          |     |          |       | C    |         | C     |        |
| Pricing / packaging / plan limits    | C       | C   |        | C         | C       | R      |        |          |     | L        | C     | C    |         | C     | C      |
| Moving code into a commercial module | C       |     |        | L         | C       |        |        |          |     | C        |       | L    |         |       |        |
| Terms, privacy, DPA, consent         | C       | C   |        |           | C       |        |        | C        |     |          | C     |      | L       |       |        |
| Release / deploy / migration         |         |     |        | C         | C       | R      | L      | R        |     |          |       |      |         |       |        |
| Security incident / vulnerability    |         |     |        | C         | C       |        | C      | L        |     |          | C     |      | C       |       |        |
| Launch / campaign                    | C       |     | C      |           |         |        | C      |          |     | C        | C     | R    | R       | L     | L      |
| Enterprise deal / procurement        | C       |     |        | C         |         |        | C      | C        |     | C        | L     | C    | C       |       |        |
| Localisation / new market            | C       | C   | C      | C         | C       | R      | C      |          |     | C        | C     | C    | L       | C     | L      |

Columns: product = `bookly-product`, ux = `bookly-ux`, design = `bookly-design-system`,
architect = `bookly-architect`, builder = `bookly-builder`, tester = `bookly-tester`,
devops = `bookly-devops`, security = `bookly-security`, ai = `bookly-ai-engineer`,
business = `bookly-business`, sales = `bookly-sales-success`, lic. = `bookly-legal-licensing`,
privacy = `bookly-legal-privacy`, brand = `bookly-brand-marketing`, growth = `bookly-growth-marketing`.
