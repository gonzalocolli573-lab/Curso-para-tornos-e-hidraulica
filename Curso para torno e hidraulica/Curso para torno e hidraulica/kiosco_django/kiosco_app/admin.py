from django.contrib import admin
from .models import Trabajo

@admin.register(Trabajo)
class TrabajoAdmin(admin.ModelAdmin):
    list_display = ('titulo', 'categoria', 'activo', 'creado')
    list_filter = ('categoria', 'activo')
    search_fields = ('titulo', 'descripcion')
