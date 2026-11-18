from controllers import auth_controller
from core.router import Router

router = Router()

# Auth
router.add("POST", "/api/auth/register", auth_controller.register)
router.add("POST", "/api/auth/login", auth_controller.login)
router.add("POST", "/api/auth/logout", auth_controller.logout, login=True)
router.add("GET", "/api/auth/me", auth_controller.me, login=True)
router.add("POST", "/api/auth/forgot", auth_controller.forgot)
router.add("POST", "/api/auth/reset/check", auth_controller.reset_check)
router.add("POST", "/api/auth/reset", auth_controller.reset)