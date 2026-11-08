from django.shortcuts import render
from django.http import JsonResponse
from .models import Trabajo

def vista_kiosco(request):
    trabajos = Trabajo.objects.filter(activo=True)
    return render(request, 'kiosco.html', {'trabajos': trabajos})

def api_fotos(request):
    trabajos = Trabajo.objects.filter(activo=True).values('id', 'titulo', 'categoria', 'descripcion', 'imagen')
    data = []
    for t in trabajos:
        data.append({
            'id': t['id'],
            'titulo': t['titulo'],
            'categoria': t['categoria'],
            'descripcion': t['descripcion'],
            'url': f"/media/{t['imagen']}" if t['imagen'] else ''
        })
    return JsonResponse(data, safe=False)
