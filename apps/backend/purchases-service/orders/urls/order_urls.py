from rest_framework.routers import SimpleRouter

from orders.views import PurchaseOrderViewSet

router = SimpleRouter(trailing_slash=False)
router.register("orders", PurchaseOrderViewSet, basename="purchase-orders")

urlpatterns = router.urls
