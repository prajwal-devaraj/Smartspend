from flask import Flask, jsonify

def problem(status:int, title:str, detail:str=None, type_:str="about:blank", **ext):
    payload = {"type": type_, "title": title, "status": status}
    if detail: payload["detail"] = detail
    payload.update(ext)
    return jsonify(payload), status, {"Content-Type": "application/problem+json"}

def register_error_handlers(app: Flask):
    @app.errorhandler(400)
    def bad_request(e): return problem(400, "Bad Request", str(e))
    @app.errorhandler(401)
    def unauthorized(e): return problem(401, "Unauthorized", str(e))
    @app.errorhandler(403)
    def forbidden(e): return problem(403, "Forbidden", str(e))
    @app.errorhandler(404)
    def notfound(e): return problem(404, "Not Found", str(e))
    @app.errorhandler(409)
    def conflict(e): return problem(409, "Conflict", str(e))
    @app.errorhandler(422)
    def unproc(e): return problem(422, "Unprocessable Entity", str(e))
    @app.errorhandler(500)
    def server(e): return problem(500, "Internal Server Error", "Unexpected server error")
