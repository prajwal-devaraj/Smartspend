from app import create_app
from app.extensions import db

app = create_app()

@app.get("/db-check")
def db_check():
    from sqlalchemy import text
    try:
        res = db.session.execute(text("SELECT DATABASE() AS db")).mappings().first()
        return {"connected_to": res["db"]}
    except Exception as e:
        return {"error": str(e)}, 500

if __name__ == "__main__":
    app.run(debug=True)
