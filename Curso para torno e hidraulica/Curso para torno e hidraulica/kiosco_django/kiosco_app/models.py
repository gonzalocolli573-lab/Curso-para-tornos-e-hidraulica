from django.db import models

class Trabajo(models.Model):
    CATEGORIAS = [
        ('torneria', 'Tornería'),
        ('hidraulica', 'Hidráulica'),
        ('general', 'Mecanizado General'),
    ]

    titulo = models.CharField(max_length=200, verbose_name="Título del Trabajo")
    categoria = models.CharField(max_length=50, choices=CATEGORIAS, default='torneria', verbose_name="Categoría")
    descripcion = models.TextField(blank=True, verbose_name="Descripción breve")
    imagen = models.ImageField(upload_to='trabajos/', verbose_name="Foto del Trabajo")
    activo = models.BooleanField(default=True, verbose_name="Mostrar en el Kiosco")
    creado = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = "Trabajo"
        verbose_name_plural = "Trabajos"
        ordering = ['-creado']

    def __str__(self):
        return f"{self.titulo} ({self.get_categoria_display()})"
