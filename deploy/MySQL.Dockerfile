FROM mysql:8.4@sha256:a81d043930e51745522bd5c430961cf8286f0a23f0a9a2a6e0108f7ea71b0902
# El servidor se inicia como mysql; no utiliza mysqlsh/Python ni el cambio de usuario con gosu.
USER root
RUN microdnf remove -y mysql-shell && microdnf clean all && rm -f /usr/local/bin/gosu
USER mysql
