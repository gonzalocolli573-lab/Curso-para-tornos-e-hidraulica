from django.urls import path
from . import views

urlpatterns = [
    path('', views.vista_kiosco, name='kiosco'),
    path('api/fotos/', views.api_fotos, name='api_fotos'),
]
