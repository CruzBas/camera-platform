using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CameraPlatform.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddBusDetails : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "Capacity",
                table: "Cameras",
                type: "integer",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Route",
                table: "Cameras",
                type: "character varying(100)",
                maxLength: 100,
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Capacity",
                table: "Cameras");

            migrationBuilder.DropColumn(
                name: "Route",
                table: "Cameras");
        }
    }
}
