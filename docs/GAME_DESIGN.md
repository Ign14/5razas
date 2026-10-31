# 5RAZAS — GAME DESIGN & TECHNICAL SPECIFICATION
**Versión:** 1.0.0  
**Estado:** Especificación inicial  
**Tipo:** RPG isométrico de mundo abierto  
**Desarrollo:** Claude Code — Opus 5.5  
**Repositorio sugerido:** `5razas-game`

---

# 1. Instrucciones generales del proyecto

Desarrollar un videojuego RPG llamado **5RAZAS**, con estética pixel art isométrica, inspirado en cinco pueblos originarios de América, sus geografías, conocimientos históricos, ecosistemas y tradiciones narrativas.

El juego deberá ofrecer un mundo interconectado con exploración, combate en tiempo real, criaturas, recolección de recursos, experimentación alquímica, fabricación y mejora de equipamiento, evolución profesional y progresión desde el nivel 1 hasta el 100.

El objetivo inicial no será implementar la totalidad del videojuego, sino construir un **vertical slice completamente jugable**, validando primero los sistemas fundamentales.

El proyecto deberá diseñarse desde el inicio para permitir ampliar su contenido sin modificar sustancialmente el motor, la arquitectura o las reglas principales.

## Principios obligatorios

1. Priorizar funcionalidad real sobre demostraciones visuales.
2. Mantener el motor independiente de los contenidos culturales.
3. Implementar sistemas modulares y configurables mediante archivos de datos.
4. Evitar valores codificados directamente para profesiones, niveles, ataques, criaturas y objetos.
5. Utilizar TypeScript estricto.
6. Incorporar pruebas automatizadas.
7. Mantener una estética pixel art coherente.
8. Optimizar para ejecución fluida en navegadores.
9. Documentar los sistemas y las decisiones arquitectónicas.
10. Implementar cada funcionalidad de manera incremental y verificable.

# 2. Universo y narrativa

## Concepto

Cinco grandes pueblos ancestrales habitan territorios distribuidos a lo largo del continente americano.

Cada territorio posee ecosistemas, recursos, formas de organización, profesiones, conocimientos y desafíos particulares.

El mundo se encuentra conectado mediante caminos y rutas naturales, mientras que determinadas regiones solamente pueden alcanzarse al adquirir las habilidades o conocimientos necesarios.

Las historias explorarán la relación entre las civilizaciones, sus territorios y fuerzas sobrenaturales de un universo ficticio.

La aventura comienza cuando el protagonista descubre que distintos acontecimientos están alterando el equilibrio de los cinco territorios.

Durante su recorrido deberá descubrir el origen de esos acontecimientos, desarrollar sus capacidades y enfrentar amenazas cada vez mayores.

## Pueblos jugables

La propuesta inicial considera:

- Maya: selvas y territorios mesoamericanos.
- Mexica: grandes lagos, ciudades y regiones volcánicas.
- Inca: cordilleras, alturas y territorios andinos.
- Mapuche: bosques templados, montañas, lagos y ríos.
- Haudenosaunee: bosques, grandes lagos y regiones del noreste de América.

Estos pueblos no deben representar categorías raciales biológicas, sino **facciones culturales jugables**.

Cada uno contará eventualmente con cinco profesiones, para un total de 25.

Las profesiones ficticias se inspirarán en técnicas y oficios documentados, pero no se presentarán como reproducciones históricas exactas.

## Normas de representación cultural

Investigar fuentes históricas y, cuando corresponda, consultar a personas o comunidades vinculadas a las tradiciones representadas.

Diferenciar explícitamente:

- Información histórica documentada.
- Tradición oral y relatos atribuidos a fuentes identificables.
- Interpretación artística.
- Elementos completamente ficticios.

Evitar utilizar ceremonias, entidades sagradas, nombres religiosos o símbolos restringidos como mecánicas triviales de combate o recompensas.

El rango final denominado Dios será una categoría fantástica de poder dentro del universo del videojuego y no una representación literal de divinidades de pueblos reales.

# 3. Diseño del mundo

## 3.1 Sistema de coordenadas

El mundo utilizará una cuadrícula lógica basada en tiles isométricos.

Configuración inicial:

- Tile visual: 64 × 32 píxeles.
- Huella lógica del tile: 1 × 1 celda.
- Mapa MVP: 64 × 64 celdas.
- Proyección: isométrica 2:1.
- Capas visuales independientes.
- Cámara con seguimiento del protagonista.
- Renderizado pixel-perfect.
- Movimiento continuo sobre colisiones lógicas.

La proyección será independiente de los datos del mundo, facilitando cálculos de movimiento, distancia, rutas y detección de colisiones.

## 3.2 Capas de escenario

Cada mapa tendrá las siguientes capas:

1. Terreno base.
2. Texturas y variaciones del terreno.
3. Caminos y senderos.
4. Agua y elementos ambientales.
5. Elevaciones y desniveles.
6. Vegetación inferior.
7. Árboles y estructuras.
8. Objetos interactivos.
9. Entidades dinámicas.
10. Elementos superiores y efectos atmosféricos.

Las capas deberán controlar correctamente el orden de renderizado y la profundidad de los sprites.

## 3.3 Generación de mapas

Implementar un sistema de mapas configurables mediante archivos JSON exportados desde Tiled.

El motor deberá admitir:

- Carga de mapas.
- Transición entre sectores.
- Objetos interactivos.
- Zonas de aparición.
- Puntos de viaje.
- Colisiones.
- Puntos de interés.
- Áreas de combate.
- Zonas de recolección.
- Regiones secretas.

Para la expansión del mundo se utilizará un sistema de sectores o chunks, con carga y descarga según la posición del jugador.

## 3.4 Minimap

Mostrar permanentemente un minimapa en la esquina superior derecha.

El minimapa deberá incluir:

- Posición actual del jugador.
- Orientación del personaje.
- Caminos descubiertos.
- Terreno cercano.
- Marcadores de misiones.
- Enemigos especiales detectados.
- NPC importantes.
- Portales y puntos de transición.
- Zonas todavía desconocidas.

Implementar niebla de exploración.

El usuario podrá ampliar el minimapa para visualizar el territorio completo y, posteriormente, el mapa continental.

# 4. Sistema de personajes

## 4.1 Creación

El jugador podrá seleccionar:

- Pueblo o civilización.
- Profesión disponible.
- Nombre.
- Apariencia básica.
- Variaciones cosméticas.

La elección de pueblo definirá el territorio inicial y las cinco profesiones disponibles.

Los atributos de combate dependerán principalmente de la profesión, no de supuestas características biológicas del pueblo.

## 4.2 Atributos

Cada personaje poseerá:

| Atributo | Función |
|---|---|
| Vida | Resistencia al daño |
| Energía | Recurso para habilidades |
| Ataque | Daño físico |
| Poder | Daño de habilidades |
| Defensa | Reducción de daño físico |
| Resistencia | Protección ante efectos |
| Velocidad | Desplazamiento |
| Cadencia | Velocidad de ataque |
| Crítico | Probabilidad de golpe crítico |
| Evasión | Probabilidad de evitar ataques |

Los atributos serán configurables mediante datos y modificadores.

# 5. Profesiones

Cada uno de los cinco pueblos tendrá cinco profesiones exclusivas.

Las profesiones deberán ofrecer cinco estilos funcionales:

1. Combate cuerpo a cuerpo.
2. Ataque a distancia.
3. Poderes elementales o fantásticos.
4. Defensa y protección.
5. Apoyo, curación o control.

Las cinco profesiones concretas de cada pueblo se definirán después de la investigación cultural y la validación del equilibrio del juego.

## Profesión inicial del MVP

Nombre provisional: **Guardián del Bosque**.

Se trata de una clase de fantasía original, utilizada para validar las mecánicas sin atribuir poderes ficticios a una función histórica específica.

Características:

- Combate cuerpo a cuerpo.
- Ataques de alcance corto.
- Buen equilibrio de defensa y movilidad.
- Uso de energía para técnicas especiales.
- Compatibilidad con combinaciones alquímicas.

# 6. Sistema de combate

El combate ocurrirá en tiempo real.

El personaje podrá desplazarse, atacar, esquivar y ejecutar habilidades durante los enfrentamientos.

## 6.1 Cinco acciones principales

Cada profesión tendrá:

| Acción | Tipo |
|---|---|
| Ataque básico | Acción recurrente |
| Poder 1 | Habilidad especializada |
| Poder 2 | Habilidad especializada |
| Poder 3 | Habilidad especializada |
| Final | Habilidad definitiva |

Cada habilidad deberá configurarse con:

- Identificador único.
- Nombre.
- Descripción.
- Tipo de daño.
- Multiplicador.
- Alcance.
- Área de efecto.
- Costo energético.
- Tiempo de recuperación.
- Animación.
- Efectos visuales.
- Condiciones de desbloqueo.
- Modificadores compatibles.

## 6.2 Habilidades del Guardián del Bosque

**Ataque básico — Golpe del Guardián**

Ataque físico de corta distancia. Puede incorporar efectos alquímicos.

**Poder 1 — Embestida**

Desplazamiento ofensivo de corta distancia que impacta enemigos.

**Poder 2 — Corte Circular**

Ataque de área alrededor del personaje.

**Poder 3 — Protección del Bosque**

Genera una barrera temporal que reduce el daño recibido.

**Final — Tempestad Ancestral**

Ataque poderoso de área que genera múltiples impactos e incorpora el elemento alquímico activo del personaje.

Los nombres y efectos son provisionales y completamente ficticios.

## 6.3 Mecánicas

Implementar:

- Hitboxes y hurtboxes.
- Daño calculado por atributos.
- Tiempo de invulnerabilidad breve después de recibir impactos.
- Estados alterados.
- Interrupciones de animación controladas.
- Retroceso por impacto.
- Enfriamiento de habilidades.
- Indicadores visuales de daño.
- Muertes y recompensas.

Los estados alterados iniciales serán quemadura, ralentización, envenenamiento y protección temporal.

# 7. Progresión y niveles

## Estructura

| Niveles | Etapa |
|---|---|
| 1–21 | Novato |
| 22–39 | Profesión I |
| 40–99 | Profesión Senior |
| 100 | Ascensión: Dios |

Al alcanzar el nivel 22, el personaje obtiene su primer título profesional.

Al nivel 40 adquiere el rango Senior.

Al nivel 100 accede a una transformación fantástica especial.

## Experiencia

Implementar una tabla de experiencia configurable, preferentemente generada mediante una curva matemática ajustable.

La progresión deberá considerar:

- Enemigos derrotados.
- Misiones completadas.
- Descubrimiento de regiones.
- Enfrentamientos especiales.
- Logros de exploración.

Cada nuevo nivel incrementará atributos de manera controlada.

Los poderes se desbloquearán en niveles configurables.

La arquitectura deberá permitir modificar el balance sin alterar el código de combate.

# 8. Fauna y supervivencia

Los animales formarán parte de ecosistemas específicos.

Cada especie tendrá:

- Hábitat.
- Comportamiento.
- Movimiento.
- Estado de alerta.
- Puntos de vida, si corresponde.
- Recursos obtenibles.
- Horarios o condiciones de aparición.

No todos los animales serán hostiles.

Algunos huirán del protagonista, otros permanecerán neutrales y ciertos animales defenderán su territorio.

Los recursos alimenticios permitirán elaborar preparaciones que regeneren vida, energía o proporcionen bonificaciones temporales.

# 9. Criaturas y bestiario

Las criaturas se dividirán en:

**Fauna natural:** animales propios del ecosistema.

**Enemigos comunes:** adversarios ficticios con distintos patrones de combate.

**Criaturas especiales:** enemigos raros con mecánicas particulares.

**Jefes:** enemigos poderosos con fases de combate.

**Bestias legendarias:** encuentros relacionados con la narrativa fantástica y, cuando exista autorización y documentación adecuada, con relatos regionales.

Cada criatura tendrá una definición de datos independiente.

Campos mínimos:

- `id`
- `name`
- `category`
- `biome`
- `levelRange`
- `stats`
- `behavior`
- `abilities`
- `lootTable`
- `spriteAtlas`
- `spawnRules`

## Jefe del MVP

Nombre provisional: **Centinela de las Raíces**.

Criatura original de fantasía.

Tres fases de enfrentamiento:

1. Ataques físicos y desplazamiento.
2. Ataques de área y aparición de obstáculos.
3. Incremento de velocidad, ataques combinados y vulnerabilidades temporales.

El jefe entregará experiencia, recursos raros y una pieza de equipamiento especial.

# 10. Herbolaria y alquimia

La alquimia será uno de los principales diferenciadores de 5RAZAS.

El jugador podrá explorar ecosistemas, recolectar plantas y experimentar combinaciones para descubrir efectos sobre sus habilidades.

## 10.1 Plantas

Cada planta tendrá:

- Identificador.
- Nombre.
- Bioma.
- Rareza.
- Propiedades alquímicas.
- Tiempo de regeneración.
- Condiciones ambientales.
- Compatibilidades.

Para el MVP se utilizarán diez especies de fantasía, evitando atribuir propiedades médicas reales a plantas sin investigación.

## 10.2 Preparaciones

Se podrán combinar dos o más ingredientes para obtener:

- Consumibles de regeneración.
- Potenciadores de combate.
- Mejoras de movilidad.
- Efectos sobre ataques.
- Resistencias temporales.

## 10.3 Modificadores elementales

Los ataques podrán adquirir propiedades como:

- Fuego.
- Hielo.
- Veneno.
- Electricidad.
- Viento.

Los elementos serán mecánicas fantásticas y no propiedades históricas de los pueblos representados.

## 10.4 Ejemplos de combinaciones

| Ingredientes ficticios | Resultado |
|---|---|
| Hoja Carmesí + Raíz Solar | Ataque con quemadura |
| Flor de Escarcha + Hongo Azul | Ataque ralentizador |
| Espora Umbría + Savia Gris | Ataque venenoso |
| Semilla del Viento + Hoja Ligera | Mayor velocidad |
| Raíz Vital + Flor Dorada | Regeneración de vida |

Las recetas deberán existir como registros de datos.

El sistema no podrá depender de condicionales específicos por combinación.

## 10.5 Descubrimiento

El jugador podrá experimentar con ingredientes sin conocer previamente sus resultados.

Una combinación válida generará una receta y la incorporará al libro de descubrimientos.

Las combinaciones inválidas podrán consumir materiales y producir resultados menores, sin bloquear el progreso.

# 11. Inventario y equipamiento

## Inventario

Implementar categorías:

- Consumibles.
- Ingredientes.
- Materiales.
- Armas.
- Armaduras.
- Accesorios.
- Objetos de misión.

Los objetos podrán apilarse cuando corresponda.

## Equipamiento

Cada profesión contará finalmente con ocho conjuntos principales.

Los conjuntos tendrán requisitos de nivel, atributos y bonificaciones.

Distribución inicial propuesta:

| Set | Nivel mínimo |
|---|---|
| I | 1 |
| II | 12 |
| III | 22 |
| IV | 35 |
| V | 40 |
| VI | 60 |
| VII | 80 |
| VIII | 100 |

Se podrán obtener piezas mediante enemigos, fabricación, exploración y jefes.

El MVP incluirá dos conjuntos completos, suficientes para probar la progresión del equipamiento.

# 12. Interfaz y experiencia de usuario

## HUD principal

Distribución inicial:

**Superior izquierda**
- Retrato del personaje.
- Nombre.
- Nivel.
- Barra de vida.
- Barra de energía.

**Superior derecha**
- Minimap.
- Coordenadas o nombre del sector.
- Botón para ampliar mapa.

**Inferior centro**
- Ataque básico.
- Poder 1.
- Poder 2.
- Poder 3.
- Final.
- Indicadores de recarga.

**Inferior derecha**
- Consumibles rápidos.
- Acceso al inventario.
- Menú de alquimia.

**Lateral derecho**
- Objetivo de misión.
- Notificaciones relevantes.

## Controles de escritorio

- WASD: movimiento.
- Mouse: dirección del ataque o selección de objetivo.
- Clic izquierdo: ataque básico.
- Teclas 1, 2, 3: habilidades especiales.
- R: habilidad final.
- Espacio: evasión.
- E: interacción.
- I: inventario.
- M: mapa.
- J: misiones.

Las teclas deberán ser configurables.

Diseñar desde el comienzo la interfaz para permitir controles táctiles en una fase posterior.

# 13. Arquitectura técnica

## Stack

- TypeScript.
- Phaser 3.
- Vite.
- Vitest.
- Playwright.
- Tiled.
- JSON para datos de contenido.
- IndexedDB para persistencia local.

Evitar incorporar React, servidores o servicios externos en la primera versión salvo necesidad técnica demostrable.

## Separación arquitectónica

**Core:** reglas independientes de Phaser.

**Systems:** lógica de combate, inventario, progresión, alquimia y exploración.

**World:** mapas, colisiones, regiones y carga de sectores.

**Entities:** personajes, animales, enemigos, NPC y objetos.

**Rendering:** sprites, animaciones, cámara y efectos.

**UI:** interfaces, inventario, minimapa y menús.

**Data:** definiciones configurables de profesiones, objetos, enemigos, habilidades, recetas y progresión.

**Persistence:** guardado, recuperación y migración de partidas.

## Requisitos

El juego deberá ser determinista en sus cálculos cuando sea posible.

Los sistemas de combate y progresión deberán ser probables sin iniciar el renderizador.

Los datos deberán validarse al cargarse.

Todo registro deberá utilizar identificadores únicos estables.

Los guardados deberán contar con versión de esquema.

# 14. Rendimiento

Objetivos iniciales:

- 60 FPS en escritorio de gama media, bajo un escenario de prueba definido.
- Movimiento fluido.
- Sin fugas evidentes de memoria.
- Renderizado únicamente de elementos relevantes.
- Carga eficiente de spritesheets.
- Reutilización de objetos mediante pooling.
- Actualizaciones de IA limitadas a entidades activas.
- Culling de elementos fuera de cámara.
- Resolución interna y escalado visual configurables.

No utilizar recursos de alta resolución que destruyan la coherencia pixel art.

# 15. Persistencia

Guardar:

- Identidad del personaje.
- Pueblo y profesión.
- Nivel y experiencia.
- Estadísticas.
- Inventario.
- Equipamiento.
- Habilidades desbloqueadas.
- Recetas descubiertas.
- Estado de misiones.
- Posición actual.
- Sectores explorados.
- Progreso de jefes.
- Configuración del usuario.

Implementar:

- Guardado manual.
- Guardado automático.
- Recuperación de partida.
- Validación de integridad.
- Migración entre versiones de datos.

# 16. Estrategia de desarrollo

## Fase 0 — Preparación

- Crear repositorio.
- Configurar TypeScript y Vite.
- Configurar Phaser.
- Configurar pruebas y linting.
- Crear documentación.
- Definir contratos de datos.

**Resultado:** proyecto compilable con pantalla inicial.

## Fase 1 — Mundo isométrico

- Cuadrícula isométrica.
- Mapa 64 × 64.
- Sistema de capas.
- Cámara.
- Colisiones.
- Personaje.
- Movimiento.
- Animaciones.
- Minimap.

**Resultado:** personaje explorable en un escenario funcional.

## Fase 2 — Combate

- Atributos.
- Ataque básico.
- Tres poderes.
- Poder final.
- Hitboxes.
- Daño.
- Enemigos.
- IA básica.
- Muerte y recompensas.

**Resultado:** ciclo de combate completamente jugable.

## Fase 3 — Progresión

- Experiencia.
- Niveles.
- Inventario.
- Equipamiento.
- Objetos.
- Botín.
- Bonificaciones.

**Resultado:** personaje que puede mejorar y conseguir equipo.

## Fase 4 — Ecosistema

- Animales.
- Plantas.
- Recolección.
- Recursos.
- Interacciones.
- Aparición de entidades.
- Comportamientos básicos.

**Resultado:** mundo con actividades adicionales al combate.

## Fase 5 — Alquimia

- Inventario de ingredientes.
- Interfaz experimental.
- Motor de recetas.
- Descubrimientos.
- Modificadores de habilidades.
- Efectos temporales.

**Resultado:** experimentación alquímica que altera realmente el combate.

## Fase 6 — Jefe y narrativa

- Jefe de tres fases.
- Misiones.
- Diálogos.
- Recompensas especiales.
- Historia del territorio.
- Guardado completo.

**Resultado:** vertical slice jugable de inicio a fin.

## Fase 7 — Expansión

Solamente después de validar el prototipo:

- Cuatro territorios adicionales.
- Veinticuatro profesiones restantes.
- Sistema continental de viajes.
- Ocho sets por profesión.
- Progresión completa hasta nivel 100.
- Más criaturas y jefes.
- Eventos.
- Optimización móvil.

# 17. Criterios de aceptación del MVP

El prototipo estará aprobado cuando:

1. Inicie sin errores desde una instalación limpia.
2. Permita comenzar una partida.
3. Renderice correctamente un mapa isométrico.
4. Permita mover y animar al personaje.
5. Detecte colisiones.
6. Muestre un minimapa funcional.
7. Permita atacar y derrotar enemigos.
8. Ejecute cinco acciones de combate diferenciadas.
9. Permita recolectar recursos.
10. Registre objetos en el inventario.
11. Permita combinar ingredientes.
12. Modifique ataques mediante alquimia.
13. Entregue experiencia.
14. Permita subir de nivel.
15. Permita equipar objetos.
16. Permita enfrentar y derrotar al jefe.
17. Guarde y recupere el progreso.
18. Mantenga una tasa de frames aceptable en los escenarios de prueba.
19. Supere las pruebas automatizadas críticas.
20. No dependa de servicios externos para jugar.

# 18. Reglas de implementación para Claude Code

Claude Code deberá seguir estas instrucciones:

- Leer la documentación completa antes de modificar el repositorio.
- Inspeccionar los archivos existentes antes de agregar nuevos.
- No reescribir módulos funcionales innecesariamente.
- Trabajar por fases.
- Dividir cada fase en tareas pequeñas.
- Implementar sistemas funcionales antes de ampliar contenido.
- Crear pruebas para toda lógica crítica.
- Ejecutar compilación y pruebas al finalizar cada tarea.
- No declarar terminadas funcionalidades incompletas.
- Utilizar placeholders cuando falten sprites definitivos.
- No inventar datos históricos ni atribuciones culturales.
- Mantener una bitácora de decisiones y cambios.
- Evitar dependencias adicionales sin justificación.
- No introducir backend, multijugador ni monetización durante el MVP.
- Mantener la compatibilidad con las partidas guardadas.
- Solicitar revisión humana cuando una decisión afecte contenido cultural sensible.

# 19. Resultado esperado

El resultado final de esta primera etapa será un videojuego RPG isométrico funcional que permita explorar un territorio natural, combatir enemigos, recolectar ingredientes, experimentar con habilidades, mejorar equipamiento, subir de nivel y enfrentar un jefe.

La estructura deberá permitir introducir contenido adicional mediante nuevos archivos de configuración, mapas y recursos visuales, conservando la lógica central.

**5RAZAS deberá construirse como un videojuego real y extensible, no como una maqueta, landing page o demostración estática.**