import re

with open("src/pages/trustee/volunteer/Dashboard.jsx", "r") as f:
    code = f.read()

# Add link to Dashboard if not present
if "volunteer/contributions" not in code:
    code = code.replace(
        '<Link to="/trustee/volunteer/cohorts"',
        '<Link to="/trustee/volunteer/contributions" className={styles.statCardCohorts}>\n          <div className={styles.statIcon}><FaChartLine /></div>\n          <div className={styles.statInfo}>\n            <h3>My Contributions</h3>\n            <p>View your lifetime impact</p>\n          </div>\n        </Link>\n\n        <Link to="/trustee/volunteer/cohorts"'
    )
    with open("src/pages/trustee/volunteer/Dashboard.jsx", "w") as f:
        f.write(code)
    print("Updated Dashboard.jsx")
else:
    print("Already updated Dashboard.jsx")
