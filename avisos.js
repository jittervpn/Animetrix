// ==========================================================================
//  AVISOS PARA LA APP  (notificación "Estamos actualizando", mantenimiento, etc.)
//  Para enviar un aviso: cambia "activo" a true, escribe el título y el mensaje
//  y cambia el "id" (cualquier texto nuevo). Al guardar, Vercel lo publica
//  en ~1 minuto y las apps lo muestran como notificación en los próximos minutos.
//  Para apagarlo: "activo: false".
// ==========================================================================
export default {
  aviso: {
    activo: false,
    id: 'ninguno',
    titulo: 'Estamos actualizando Animetrix',
    mensaje: 'Estamos mejorando la app. Algunos títulos pueden tardar en cargar por unos minutos.',
  },
};
