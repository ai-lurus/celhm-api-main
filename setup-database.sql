USE `wardappc_celhm`;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `usuarios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL UNIQUE,
  `telefono` varchar(20) DEFAULT NULL,
  `rol` enum('admin','laboratorio','direccion') NOT NULL DEFAULT 'admin',
  `fecha_registro` timestamp DEFAULT CURRENT_TIMESTAMP,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `clientes` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `telefono` varchar(20) NOT NULL,
  `email` varchar(100) DEFAULT NULL,
  `direccion` text,
  `fecha_registro` timestamp DEFAULT CURRENT_TIMESTAMP,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `categorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `tipo` enum('accesorios','equipos','servicios','insumos') NOT NULL,
  `activa` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `subcategorias` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `categoria_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `activa` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `marcas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(50) NOT NULL,
  `descripcion` text,
  `activa` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `modelos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `marca_id` int(11) NOT NULL,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`marca_id`) REFERENCES `marcas`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `productos` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `codigo` varchar(50) NOT NULL UNIQUE,
  `nombre` varchar(200) NOT NULL,
  `descripcion` text,
  `precio` decimal(10,2) NOT NULL,
  `stock` int(11) DEFAULT 0,
  `stock_minimo` int(11) DEFAULT 0,
  `stock_maximo` int(11) DEFAULT 100,
  `categoria_id` int(11) NOT NULL,
  `subcategoria_id` int(11) DEFAULT NULL,
  `marca_id` int(11) DEFAULT NULL,
  `modelo_id` int(11) DEFAULT NULL,
  `fecha_creacion` timestamp DEFAULT CURRENT_TIMESTAMP,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`),
  FOREIGN KEY (`subcategoria_id`) REFERENCES `subcategorias`(`id`),
  FOREIGN KEY (`marca_id`) REFERENCES `marcas`(`id`),
  FOREIGN KEY (`modelo_id`) REFERENCES `modelos`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `servicios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `nombre` varchar(100) NOT NULL,
  `descripcion` text,
  `precio_base` decimal(10,2) NOT NULL,
  `categoria` enum('liberacion','desbloqueo','respaldo','configuracion','limpieza','refaccion') NOT NULL,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `tickets` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `folio` varchar(20) NOT NULL UNIQUE,
  `cliente_id` int(11) NOT NULL,
  `equipo` varchar(100) NOT NULL,
  `falla_dano` text NOT NULL,
  `riesgo_observaciones` text,
  `accesorios_recibidos` text,
  `tipo_garantia` varchar(50),
  `cotizacion_aproximada` decimal(10,2),
  `estado` enum('recibido','diagnostico','esperando_pieza','reparacion_turno','reparado','entregado','cancelado') DEFAULT 'recibido',
  `usuario_asignado` int(11) DEFAULT NULL,
  `fecha_ingreso` timestamp DEFAULT CURRENT_TIMESTAMP,
  `fecha_estimada_entrega` date,
  `fecha_entrega` timestamp NULL,
  `activo` tinyint(1) DEFAULT 1,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`),
  FOREIGN KEY (`usuario_asignado`) REFERENCES `usuarios`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `ticket_servicios` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticket_id` int(11) NOT NULL,
  `servicio_id` int(11) NOT NULL,
  `precio` decimal(10,2) NOT NULL,
  `descripcion` text,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`servicio_id`) REFERENCES `servicios`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `ticket_historial` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `ticket_id` int(11) NOT NULL,
  `estado_anterior` varchar(50),
  `estado_nuevo` varchar(50) NOT NULL,
  `comentario` text,
  `usuario_id` int(11) NOT NULL,
  `fecha_cambio` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `ventas` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `folio` varchar(20) NOT NULL UNIQUE,
  `cliente_id` int(11) DEFAULT NULL,
  `usuario_id` int(11) NOT NULL,
  `subtotal` decimal(10,2) NOT NULL,
  `impuestos` decimal(10,2) DEFAULT 0,
  `total` decimal(10,2) NOT NULL,
  `metodo_pago` enum('efectivo','tarjeta','transferencia','otro') NOT NULL,
  `fecha_venta` timestamp DEFAULT CURRENT_TIMESTAMP,
  `estado` enum('completada','cancelada','pendiente') DEFAULT 'completada',
  PRIMARY KEY (`id`),
  FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `venta_detalles` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `venta_id` int(11) NOT NULL,
  `producto_id` int(11) DEFAULT NULL,
  `servicio_id` int(11) DEFAULT NULL,
  `cantidad` int(11) NOT NULL,
  `precio_unitario` decimal(10,2) NOT NULL,
  `total` decimal(10,2) NOT NULL,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`),
  FOREIGN KEY (`servicio_id`) REFERENCES `servicios`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `configuracion` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `clave` varchar(100) NOT NULL UNIQUE,
  `valor` text,
  `descripcion` varchar(255),
  `fecha_actualizacion` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
CREATE TABLE IF NOT EXISTS `logs_sistema` (
  `id` int(11) NOT NULL AUTO_INCREMENT,
  `tipo` varchar(50) NOT NULL,
  `mensaje` text NOT NULL,
  `usuario_id` int(11) DEFAULT NULL,
  `fecha` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

USE `wardappc_celhm`;
INSERT INTO `usuarios` (`nombre`, `email`, `telefono`, `rol`) VALUES
('Administrador', 'admin@celhm.com', '3338545850', 'admin'),
('Laboratorio', 'lab@celhm.com', '3322012536', 'laboratorio'),
('Dirección', 'direccion@celhm.com', '3338545850', 'direccion');

USE `wardappc_celhm`;
INSERT INTO `categorias` (`nombre`, `descripcion`, `tipo`) VALUES
('Accesorios', 'Accesorios para dispositivos móviles', 'accesorios'),
('Equipos', 'Dispositivos móviles y tablets', 'equipos'),
('Servicios', 'Servicios de reparación y mantenimiento', 'servicios'),
('Insumos Telcel', 'Productos y servicios Telcel', 'insumos');

USE `wardappc_celhm`;
INSERT INTO `subcategorias` (`categoria_id`, `nombre`, `descripcion`) VALUES
(1, 'Micas', 'Protectores de pantalla'),
(1, 'Protectores', 'Fundas y protectores'),
(1, 'Cables y Cargadores', 'Cables y adaptadores'),
(1, 'Manos Libres y Audífonos', 'Audio y comunicación'),
(1, 'Memorias', 'Almacenamiento externo');

USE `wardappc_celhm`;
INSERT INTO `marcas` (`nombre`, `descripcion`) VALUES
('iPhone', 'Apple iPhone'),
('Samsung', 'Samsung Electronics'),
('Huawei/Honor', 'Huawei y Honor'),
('Xiaomi', 'Xiaomi Corporation'),
('Motorola', 'Motorola Mobility'),
('Oppo', 'OPPO Electronics'),
('ZTE', 'ZTE Corporation');

USE `wardappc_celhm`;
INSERT INTO `servicios` (`nombre`, `descripcion`, `precio_base`, `categoria`) VALUES
('Liberación Nacional', 'Liberación de equipos nacionales', 150.00, 'liberacion'),
('Liberación Internacional', 'Liberación de equipos internacionales', 300.00, 'liberacion'),
('Desbloqueo', 'Desbloqueo de dispositivos', 200.00, 'desbloqueo'),
('Hard Reset', 'Restauración de fábrica', 100.00, 'desbloqueo'),
('Respaldo de Datos', 'Respaldo de fotos y contactos', 150.00, 'respaldo'),
('Transferencia 100%', 'Transferencia entre dispositivos', 200.00, 'respaldo'),
('Configuración Datos', 'Configuración de datos móviles', 80.00, 'configuracion'),
('Personalización', 'Personalización de dispositivos', 120.00, 'configuracion'),
('Limpieza', 'Limpieza de dispositivos', 100.00, 'limpieza'),
('Cambio de Batería', 'Reemplazo de batería', 250.00, 'refaccion'),
('Cambio de Pantalla', 'Reemplazo de pantalla', 800.00, 'refaccion'),
('Cambio de Bocina', 'Reemplazo de altavoz', 180.00, 'refaccion');

USE `wardappc_celhm`;
INSERT INTO `configuracion` (`clave`, `valor`, `descripcion`) VALUES
('nombre_empresa', 'CelHM', 'Nombre de la empresa'),
('version_sistema', '1.0.0', 'Versión actual del sistema'),
('moneda', 'MXN', 'Moneda por defecto'),
('impuestos', '16', 'Porcentaje de impuestos'),
('direccion', 'Magisterio 1043 Local 15', 'Dirección de la empresa'),
('telefono', '3338545850', 'Teléfono principal'),
('whatsapp', '3322012536', 'WhatsApp de contacto'),
('email', 'celhmdireccion@gmail.com', 'Email principal'),
('facebook', 'https://www.facebook.com/CelHMlanormal', 'Página de Facebook');

USE `wardappc_celhm`;
SELECT 
    TABLE_NAME as 'Tabla',
    TABLE_ROWS as 'Filas',
    ROUND(((DATA_LENGTH + INDEX_LENGTH) / 1024 / 1024), 2) as 'Tamaño (MB)'
FROM information_schema.TABLES 
WHERE TABLE_SCHEMA = 'wardappc_celhm'
ORDER BY TABLE_NAME;
